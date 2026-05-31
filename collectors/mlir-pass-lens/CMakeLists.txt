cmake_minimum_required(VERSION 3.20)
project(PassLensMLIRCollector LANGUAGES CXX)

find_package(MLIR REQUIRED CONFIG)
find_package(LLVM REQUIRED CONFIG)

message(STATUS "Using MLIRConfig.cmake in: ${MLIR_DIR}")
message(STATUS "Using LLVMConfig.cmake in: ${LLVM_DIR}")

list(APPEND CMAKE_MODULE_PATH "${MLIR_CMAKE_DIR}")
list(APPEND CMAKE_MODULE_PATH "${LLVM_CMAKE_DIR}")
include(AddLLVM)
include(AddMLIR)

set(CMAKE_CXX_STANDARD 17 CACHE STRING "C++ standard")
set(CMAKE_CXX_STANDARD_REQUIRED YES)

include_directories(${LLVM_INCLUDE_DIRS})
include_directories(${MLIR_INCLUDE_DIRS})
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)
add_definitions(${LLVM_DEFINITIONS})

add_mlir_library(PassLensMLIRInstrumentation
  lib/PassLensInstrumentation.cpp

  LINK_LIBS PUBLIC
  MLIRIR
  MLIRPass
  LLVMSupport
)

add_llvm_executable(pass-lens-mlir-opt
  tools/pass-lens-mlir-opt.cpp
)

llvm_update_compile_flags(pass-lens-mlir-opt)
target_link_libraries(pass-lens-mlir-opt
  PRIVATE
  PassLensMLIRInstrumentation
  MLIRAllDialects
  MLIRAllPasses
  MLIRIR
  MLIRParser
  MLIRPass
  MLIRSupport
  LLVMSupport
)
