# 实战项目六：Redis 缓存与 Celery 异步任务

## 任务描述

在 Web 应用中集成 Redis 作为缓存层，并使用 Celery 处理耗时的后台任务（如发送邮件、生成报表）。

## 技术要点

- **Redis**: 键值对存储、过期时间设置。
- **Celery**: 任务定义、Broker 配置、Worker 启动。
- **RabbitMQ/Redis**: 作为消息中间件。

## 实验逻辑

1. 定义一个耗时函数 `process_data`。
2. 使用 `@celery.task` 装饰器进行封装。
3. 在主程序中异步调用 `delay()` 方法。
