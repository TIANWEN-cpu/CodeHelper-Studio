#if !defined(_WIN32)
#error "codehelper-job-host is Windows-only"
#endif

#if !defined(_WIN64)
#error "codehelper-job-host must be built for x64"
#endif

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>

#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>

namespace {

constexpr std::uint64_t kBytesPerMiB = 1024ULL * 1024ULL;
constexpr DWORD kJobExitPollMs = 10;
constexpr DWORD kJobExitTimeoutMs = 5000;

struct Options {
  DWORD utilityPid = 0;
  DWORD activeProcessLimit = 0;
  SIZE_T processMemoryLimit = 0;
  SIZE_T jobMemoryLimit = 0;
};

void PrintError(const char* stage, DWORD win32Code) {
  char line[256] = {};
  const int length = std::snprintf(
    line,
    sizeof(line),
    "ERROR stage=%s Win32=%lu\n",
    stage,
    static_cast<unsigned long>(win32Code)
  );

  if (length <= 0) {
    return;
  }

  std::fputs(line, stdout);
  std::fflush(stdout);
  std::fputs(line, stderr);
  std::fflush(stderr);
}

bool ParseUnsigned(const char* text, std::uint64_t* value) {
  if (text == nullptr || text[0] == '\0') {
    return false;
  }

  std::uint64_t parsed = 0;
  for (const unsigned char* cursor = reinterpret_cast<const unsigned char*>(text);
       *cursor != '\0';
       ++cursor) {
    if (*cursor < '0' || *cursor > '9') {
      return false;
    }

    const std::uint64_t digit = static_cast<std::uint64_t>(*cursor - '0');
    if (parsed > (std::numeric_limits<std::uint64_t>::max() - digit) / 10ULL) {
      return false;
    }
    parsed = parsed * 10ULL + digit;
  }

  *value = parsed;
  return true;
}

bool ReadNamedValue(
  int argc,
  char* argv[],
  int* index,
  const char** name,
  const char** value
) {
  if (*index >= argc) {
    return false;
  }

  *name = argv[*index];
  if (*name == nullptr || std::strncmp(*name, "--", 2) != 0) {
    return false;
  }

  if (*index + 1 >= argc) {
    return false;
  }

  *value = argv[*index + 1];
  *index += 2;
  return true;
}

bool ParseOptions(int argc, char* argv[], Options* options) {
  if (argc != 9) {
    return false;
  }

  bool hasUtilityPid = false;
  bool hasActiveProcessLimit = false;
  bool hasProcessMemory = false;
  bool hasJobMemory = false;
  std::uint64_t utilityPid = 0;
  std::uint64_t activeProcessLimit = 0;
  std::uint64_t processMemoryMiB = 0;
  std::uint64_t jobMemoryMiB = 0;

  int index = 1;
  while (index < argc) {
    const char* name = nullptr;
    const char* valueText = nullptr;
    if (!ReadNamedValue(argc, argv, &index, &name, &valueText)) {
      return false;
    }

    std::uint64_t value = 0;
    if (!ParseUnsigned(valueText, &value) || value == 0) {
      return false;
    }

    if (std::strcmp(name, "--utilityPid") == 0 && !hasUtilityPid) {
      utilityPid = value;
      hasUtilityPid = true;
    } else if (std::strcmp(name, "--activeProcessLimit") == 0 && !hasActiveProcessLimit) {
      activeProcessLimit = value;
      hasActiveProcessLimit = true;
    } else if (std::strcmp(name, "--processMemoryMB") == 0 && !hasProcessMemory) {
      processMemoryMiB = value;
      hasProcessMemory = true;
    } else if (std::strcmp(name, "--jobMemoryMB") == 0 && !hasJobMemory) {
      jobMemoryMiB = value;
      hasJobMemory = true;
    } else {
      return false;
    }
  }

  constexpr std::uint64_t maxDword = static_cast<std::uint64_t>(MAXDWORD);
  constexpr std::uint64_t maxSizeT = static_cast<std::uint64_t>(
    std::numeric_limits<SIZE_T>::max()
  );
  if (!hasUtilityPid || !hasActiveProcessLimit || !hasProcessMemory || !hasJobMemory ||
      utilityPid > maxDword || activeProcessLimit > maxDword ||
      processMemoryMiB > maxSizeT / kBytesPerMiB ||
      jobMemoryMiB > maxSizeT / kBytesPerMiB) {
    return false;
  }

  options->utilityPid = static_cast<DWORD>(utilityPid);
  options->activeProcessLimit = static_cast<DWORD>(activeProcessLimit);
  options->processMemoryLimit = static_cast<SIZE_T>(processMemoryMiB * kBytesPerMiB);
  options->jobMemoryLimit = static_cast<SIZE_T>(jobMemoryMiB * kBytesPerMiB);
  return true;
}

bool WaitForJobProcessesToExit(HANDLE job, DWORD* win32Code) {
  const ULONGLONG deadline = GetTickCount64() + kJobExitTimeoutMs;
  while (true) {
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting = {};
    if (!QueryInformationJobObject(
          job,
          JobObjectBasicAccountingInformation,
          &accounting,
          static_cast<DWORD>(sizeof(accounting)),
          nullptr)) {
      *win32Code = GetLastError();
      return false;
    }
    if (accounting.ActiveProcesses == 0) {
      return true;
    }
    if (GetTickCount64() >= deadline) {
      *win32Code = ERROR_TIMEOUT;
      return false;
    }
    Sleep(kJobExitPollMs);
  }
}

bool TerminateAndDrainJob(HANDLE job, const char** failureStage, DWORD* win32Code) {
  if (!TerminateJobObject(job, ERROR_PROCESS_ABORTED)) {
    *failureStage = "TerminateJobObject";
    *win32Code = GetLastError();
    return false;
  }
  if (!WaitForJobProcessesToExit(job, win32Code)) {
    *failureStage = "WaitForJobProcesses";
    return false;
  }
  return true;
}

int FailBeforeReady(const char* stage, DWORD win32Code, HANDLE process, HANDLE job) {
  PrintError(stage, win32Code);
  if (process != nullptr) {
    CloseHandle(process);
  }
  if (job != nullptr) {
    CloseHandle(job);
  }
  return 1;
}

}  // namespace

int main(int argc, char* argv[]) {
  static_assert(sizeof(void*) == 8, "codehelper-job-host requires an x64 build");

  Options options;
  if (!ParseOptions(argc, argv, &options) || options.utilityPid == GetCurrentProcessId()) {
    PrintError("ParseArguments", ERROR_INVALID_PARAMETER);
    return 2;
  }

  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (job == nullptr) {
    return FailBeforeReady("CreateJobObject", GetLastError(), nullptr, nullptr);
  }

  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
  limits.BasicLimitInformation.LimitFlags =
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE |
    JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION |
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS |
    JOB_OBJECT_LIMIT_PROCESS_MEMORY |
    JOB_OBJECT_LIMIT_JOB_MEMORY;
  limits.BasicLimitInformation.ActiveProcessLimit = options.activeProcessLimit;
  limits.ProcessMemoryLimit = options.processMemoryLimit;
  limits.JobMemoryLimit = options.jobMemoryLimit;

  if (!SetInformationJobObject(
        job,
        JobObjectExtendedLimitInformation,
        &limits,
        static_cast<DWORD>(sizeof(limits)))) {
    return FailBeforeReady("SetInformationJobObject", GetLastError(), nullptr, job);
  }

  constexpr DWORD processAccess =
    PROCESS_SET_QUOTA |
    PROCESS_TERMINATE |
    PROCESS_QUERY_LIMITED_INFORMATION |
    SYNCHRONIZE;
  HANDLE utilityProcess = OpenProcess(processAccess, FALSE, options.utilityPid);
  if (utilityProcess == nullptr) {
    return FailBeforeReady("OpenProcess", GetLastError(), nullptr, job);
  }

  DWORD utilityExitCode = 0;
  if (!GetExitCodeProcess(utilityProcess, &utilityExitCode)) {
    return FailBeforeReady("GetExitCodeProcess", GetLastError(), utilityProcess, job);
  }
  if (utilityExitCode != STILL_ACTIVE) {
    return FailBeforeReady("UtilityProcessExited", ERROR_PROCESS_ABORTED, utilityProcess, job);
  }

  if (!AssignProcessToJobObject(job, utilityProcess)) {
    return FailBeforeReady("AssignProcessToJobObject", GetLastError(), utilityProcess, job);
  }

  if (std::fputs("READY\n", stdout) == EOF || std::fflush(stdout) != 0) {
    DWORD error = GetLastError();
    if (error == ERROR_SUCCESS) {
      error = ERROR_WRITE_FAULT;
    }
    PrintError("WriteReady", error);
    const char* cleanupStage = nullptr;
    DWORD cleanupError = ERROR_SUCCESS;
    if (!TerminateAndDrainJob(job, &cleanupStage, &cleanupError)) {
      PrintError(cleanupStage, cleanupError);
    }
    CloseHandle(utilityProcess);
    CloseHandle(job);
    return 1;
  }

  const DWORD waitResult = WaitForSingleObject(utilityProcess, INFINITE);
  if (waitResult != WAIT_OBJECT_0) {
    const DWORD error = waitResult == WAIT_FAILED ? GetLastError() : ERROR_GEN_FAILURE;
    PrintError("WaitForUtilityProcess", error);
    const char* cleanupStage = nullptr;
    DWORD cleanupError = ERROR_SUCCESS;
    if (!TerminateAndDrainJob(job, &cleanupStage, &cleanupError)) {
      PrintError(cleanupStage, cleanupError);
    }
    CloseHandle(utilityProcess);
    CloseHandle(job);
    return 1;
  }

  const char* cleanupStage = nullptr;
  DWORD cleanupError = ERROR_SUCCESS;
  if (!TerminateAndDrainJob(job, &cleanupStage, &cleanupError)) {
    PrintError(cleanupStage, cleanupError);
    CloseHandle(utilityProcess);
    CloseHandle(job);
    return 1;
  }

  CloseHandle(utilityProcess);
  CloseHandle(job);
  return 0;
}
