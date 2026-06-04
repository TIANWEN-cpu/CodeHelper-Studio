# 多线程与并发编程

## 概述

C++11 引入了标准化的多线程支持，让 C++ 程序可以充分利用多核处理器。本章将系统讲解 `std::thread` 的创建与管理、互斥锁与锁守卫、条件变量、`std::future` 与异步编程，以及数据竞争和死锁的避免方法。并发编程是高级 C++ 的必备技能。

## std::thread 基础

### 创建线程

```cpp
#include <iostream>
#include <thread>
#include <string>

// 普通函数作为线程入口
void printMessage(const std::string& msg, int times) {
    for (int i = 0; i < times; ++i) {
        std::cout << msg << " (线程ID: " << std::this_thread::get_id() << ")" << std::endl;
    }
}

// Lambda 作为线程入口
void lambdaThread() {
    auto task = []() {
        std::cout << "Lambda 线程运行中" << std::endl;
    };
    std::thread t(task);
    t.join();
}

int main() {
    std::cout << "主线程ID: " << std::this_thread::get_id() << std::endl;

    // 创建线程
    std::thread t1(printMessage, "Hello from thread!", 3);

    // 等待线程完成
    t1.join();

    std::cout << "主线程继续执行" << std::endl;

    return 0;
}
```

### join vs detach

```cpp
#include <iostream>
#include <thread>
#include <chrono>

void worker(int id) {
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::cout << "工作线程 " << id << " 完成" << std::endl;
}

int main() {
    // join：等待线程结束
    std::thread t1(worker, 1);
    t1.join();  // 主线程在此等待 t1 完成
    std::cout << "t1 已 join" << std::endl;

    // detach：线程独立运行，主线程不等待
    std::thread t2(worker, 2);
    t2.detach();  // t2 在后台运行，主线程继续
    std::cout << "t2 已 detach" << std::endl;

    // 注意：detach 后无法再控制线程
    // std::cout << t2.joinable() << std::endl;  // false

    // 重要：线程对象销毁前必须 join 或 detach
    // std::thread t3(worker, 3);
    // }  // 如果 t3 既没 join 也没 detach，程序会 terminate！

    return 0;
}
```

### RAII 线程管理

```cpp
#include <iostream>
#include <thread>

class ThreadGuard {
public:
    explicit ThreadGuard(std::thread t) : thread_(std::move(t)) {}
    ~ThreadGuard() {
        if (thread_.joinable()) {
            thread_.join();  // 析构时自动 join
        }
    }
    // 禁止拷贝
    ThreadGuard(const ThreadGuard&) = delete;
    ThreadGuard& operator=(const ThreadGuard&) = delete;
    // 允许移动
    ThreadGuard(ThreadGuard&&) = default;
    ThreadGuard& operator=(ThreadGuard&&) = default;

private:
    std::thread thread_;
};

void doWork() {
    std::cout << "工作中..." << std::endl;
}

int main() {
    ThreadGuard guard(std::thread(doWork));
    // 即使抛出异常，guard 的析构函数也会 join 线程
    return 0;
}
```

## 数据竞争与互斥锁

### 数据竞争问题

```cpp
#include <iostream>
#include <thread>
#include <vector>

int counter = 0;  // 共享变量

void increment() {
    for (int i = 0; i < 100000; ++i) {
        counter++;  // 不是原子操作！可能被中断
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(increment);
    }
    for (auto& t : threads) {
        t.join();
    }

    // 期望结果：1000000
    // 实际结果：通常小于 1000000（数据竞争）
    std::cout << "counter = " << counter << std::endl;

    return 0;
}
```

### std::mutex 与 std::lock_guard

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <vector>

int counter = 0;
std::mutex mtx;  // 互斥锁

void safeIncrement() {
    for (int i = 0; i < 100000; ++i) {
        std::lock_guard<std::mutex> lock(mtx);  // 构造时加锁，析构时解锁
        counter++;
    }
}

int main() {
    std::vector<std::thread> threads;
    for (int i = 0; i < 10; ++i) {
        threads.emplace_back(safeIncrement);
    }
    for (auto& t : threads) {
        t.join();
    }

    std::cout << "counter = " << counter << std::endl;  // 正确：1000000

    return 0;
}
```

### std::unique_lock：更灵活的锁

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx;

void flexibleLock() {
    // unique_lock 支持延迟加锁、手动解锁
    std::unique_lock<std::mutex> lock(mtx, std::defer_lock);

    // 做一些不需要锁的工作
    std::cout << "不需要锁的工作" << std::endl;

    // 手动加锁
    lock.lock();
    std::cout << "锁已获取" << std::endl;

    // 手动解锁（提前释放锁，减少锁的持有时间）
    lock.unlock();
    std::cout << "锁已释放" << std::endl;

    // 做一些不需要锁的工作
    std::cout << "更多不需要锁的工作" << std::endl;

    // 可以重新加锁
    lock.lock();
    std::cout << "重新加锁" << std::endl;
    // 析构时自动解锁
}

int main() {
    std::thread t(flexibleLock);
    t.join();
    return 0;
}
```

### lock_guard vs unique_lock

| 特性                    | lock_guard   | unique_lock        |
| ----------------------- | ------------ | ------------------ |
| 构造时加锁              | 是           | 可选（defer_lock） |
| 手动解锁                | 否           | 是                 |
| 转移所有权              | 否           | 是                 |
| 用于 condition_variable | 否           | 是                 |
| 性能开销                | 更小         | 稍大               |
| 适用场景                | 简单的临界区 | 需要灵活控制的场景 |

## 条件变量

条件变量用于线程间的同步：一个线程等待某个条件成立，另一个线程通知它。

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <chrono>

// 线程安全的队列（生产者-消费者模型）
template <typename T>
class ThreadSafeQueue {
public:
    void push(T value) {
        {
            std::lock_guard<std::mutex> lock(mtx_);
            queue_.push(std::move(value));
        }
        cv_.notify_one();  // 通知等待的消费者
    }

    T pop() {
        std::unique_lock<std::mutex> lock(mtx_);
        // 等待队列非空
        cv_.wait(lock, [this] { return !queue_.empty(); });

        T value = std::move(queue_.front());
        queue_.pop();
        return value;
    }

    bool tryPop(T& value) {
        std::lock_guard<std::mutex> lock(mtx_);
        if (queue_.empty()) return false;
        value = std::move(queue_.front());
        queue_.pop();
        return true;
    }

private:
    std::queue<T> queue_;
    std::mutex mtx_;
    std::condition_variable cv_;
};

int main() {
    ThreadSafeQueue<int> queue;

    // 生产者线程
    std::thread producer([&queue]() {
        for (int i = 1; i <= 5; ++i) {
            std::cout << "生产: " << i << std::endl;
            queue.push(i);
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        queue.push(-1);  // 结束信号
    });

    // 消费者线程
    std::thread consumer([&queue]() {
        while (true) {
            int value = queue.pop();
            if (value == -1) break;
            std::cout << "消费: " << value << std::endl;
        }
    });

    producer.join();
    consumer.join();

    return 0;
}
```

## std::future 与 std::async

`std::async` 提供了一种更高级的异步编程方式，可以直接获取线程的返回值。

```cpp
#include <iostream>
#include <future>
#include <chrono>
#include <string>

// 耗时计算
int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    // std::async：异步执行并返回 future
    std::future<int> result = std::async(std::launch::async, fibonacci, 35);

    // 在等待期间可以做其他事情
    std::cout << "计算中..." << std::endl;

    // get()：等待结果并获取返回值
    int fib = result.get();
    std::cout << "fibonacci(35) = " << fib << std::endl;

    // std::launch::async：强制在新线程中执行
    auto f1 = std::async(std::launch::async, []() {
        std::cout << "异步线程" << std::endl;
        return 42;
    });

    // std::launch::deferred：延迟执行（调用 get() 时才执行）
    auto f2 = std::async(std::launch::deferred, []() {
        std::cout << "延迟执行" << std::endl;
        return 100;
    });

    std::cout << "f1.get() = " << f1.get() << std::endl;
    std::cout << "f2.get() = " << f2.get() << std::endl;

    return 0;
}
```

### std::promise

```cpp
#include <iostream>
#include <future>
#include <thread>

void compute(std::promise<int> prom) {
    // 模拟耗时计算
    std::this_thread::sleep_for(std::chrono::seconds(1));
    prom.set_value(42);  // 设置结果
}

int main() {
    std::promise<int> prom;
    std::future<int> fut = prom.get_future();

    std::thread t(compute, std::move(prom));

    std::cout << "等待结果..." << std::endl;
    int result = fut.get();  // 阻塞等待
    std::cout << "结果: " << result << std::endl;

    t.join();
    return 0;
}
```

### 异常处理

```cpp
#include <iostream>
#include <future>
#include <stdexcept>

int riskyOperation() {
    throw std::runtime_error("出错了！");
    return 42;
}

int main() {
    std::future<int> fut = std::async(std::launch::async, riskyOperation);

    try {
        int result = fut.get();  // 异常会被 rethrow
        std::cout << "结果: " << result << std::endl;
    } catch (const std::exception& e) {
        std::cout << "捕获异常: " << e.what() << std::endl;
    }

    return 0;
}
```

## 死锁

### 什么是死锁

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <chrono>

std::mutex mtx1, mtx2;

void threadA() {
    std::lock_guard<std::mutex> lock1(mtx1);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock2(mtx2);  // 可能死锁！
    std::cout << "Thread A 完成" << std::endl;
}

void threadB() {
    std::lock_guard<std::mutex> lock2(mtx2);
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    std::lock_guard<std::mutex> lock1(mtx1);  // 可能死锁！
    std::cout << "Thread B 完成" << std::endl;
}
```

### 避免死锁的方法

```cpp
#include <iostream>
#include <thread>
#include <mutex>

std::mutex mtx1, mtx2;

// 方法 1：std::lock 同时获取多个锁
void safeThreadA() {
    std::unique_lock<std::mutex> lock1(mtx1, std::defer_lock);
    std::unique_lock<std::mutex> lock2(mtx2, std::defer_lock);
    std::lock(lock1, lock2);  // 同时获取，避免死锁
    std::cout << "Thread A 完成" << std::endl;
}

// 方法 2：std::scoped_lock（C++17）
void safeThreadB() {
    std::scoped_lock lock(mtx1, mtx2);  // C++17：自动避免死锁
    std::cout << "Thread B 完成" << std::endl;
}

// 方法 3：始终按相同顺序加锁
void orderedThread() {
    std::lock_guard<std::mutex> lock1(mtx1);  // 始终先锁 mtx1
    std::lock_guard<std::mutex> lock2(mtx2);  // 再锁 mtx2
    std::cout << "有序 Thread 完成" << std::endl;
}

int main() {
    std::thread t1(safeThreadA);
    std::thread t2(safeThreadB);
    t1.join();
    t2.join();
    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：忘记 join/detach

```cpp
void badFunction() {
    std::thread t([]() {
        // 做一些工作
    });
    // t 离开作用域，既没 join 也没 detach → std::terminate！
}

// 正确做法
void goodFunction() {
    std::thread t([]() {
        // 做一些工作
    });
    t.join();  // 或 t.detach()
}
```

### 陷阱 2：锁的粒度过大

```cpp
// 不推荐：锁住了不必要的操作
void badLock() {
    std::lock_guard<std::mutex> lock(mtx);
    data_.push_back(42);
    std::cout << "添加了元素";  // 不需要锁的操作
    writeToFile();              // 不需要锁的操作
}

// 推荐：缩小临界区
void goodLock() {
    {
        std::lock_guard<std::mutex> lock(mtx);
        data_.push_back(42);
    }
    std::cout << "添加了元素";
    writeToFile();
}
```

### 最佳实践

1. **优先使用 `std::async` 和 `std::future` 而非裸线程**
2. **始终使用 RAII 锁（lock_guard 或 unique_lock）**
3. **缩小临界区，减少锁的持有时间**
4. **使用 `std::scoped_lock`（C++17）避免死锁**
5. **避免在持有锁时调用用户提供的回调函数**
6. **使用 `std::atomic` 代替 mutex 管理简单变量**
7. **线程对象销毁前必须 join 或 detach**

## 练习

1. 实现一个线程安全的计数器类 `AtomicCounter`，支持多线程并发递增。

2. 用生产者-消费者模型实现一个简易的任务队列，支持多个生产者和消费者。

3. 用 `std::async` 并行计算数组中所有元素的和（分块计算后合并）。

4. 实现一个带超时功能的锁守卫：如果在规定时间内无法获取锁，则放弃。

5. 模拟哲学家就餐问题，用不同的策略避免死锁。

## 参考链接

- [std::thread - cppreference](https://en.cppreference.com/w/cpp/thread/thread)
- [std::mutex - cppreference](https://en.cppreference.com/w/cpp/thread/mutex)
- [std::lock_guard - cppreference](https://en.cppreference.com/w/cpp/thread/lock_guard)
- [std::unique_lock - cppreference](https://en.cppreference.com/w/cpp/thread/unique_lock)
- [std::condition_variable - cppreference](https://en.cppreference.com/w/cpp/thread/condition_variable)
- [std::future - cppreference](https://en.cppreference.com/w/cpp/thread/future)
- [std::async - cppreference](https://en.cppreference.com/w/cpp/thread/async)
- [std::promise - cppreference](https://en.cppreference.com/w/cpp/thread/promise)
- [C++ Core Guidelines: CP.1 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-concurrency)
