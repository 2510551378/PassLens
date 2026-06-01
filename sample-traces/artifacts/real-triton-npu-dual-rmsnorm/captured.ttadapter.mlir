module {
  func.func @fused_dual_residual_rmsnorm_kernel(%arg0: memref<?xi8>, %arg1: memref<?xf16> {tt.divisibility = 16 : i32}, %arg2: memref<?xf16> {tt.divisibility = 16 : i32}, %arg3: memref<?xf16> {tt.divisibility = 16 : i32}, %arg4: memref<?xf16> {tt.divisibility = 16 : i32}, %arg5: memref<?xf16> {tt.divisibility = 16 : i32, tt.shape_0 = 0 : i32, tt.shape_1 = 0 : i32, tt.shape_2 = 0 : i32, tt.shape_3 = 0 : i32}, %arg6: memref<?xf16> {tt.divisibility = 16 : i32}, %arg7: i32, %arg8: i32, %arg9: i32, %arg10: i32, %arg11: i32, %arg12: i32) attributes {WorkspaceArgIdx = 0 : i64, global_kernel = "local", mix_mode = "aiv"} {
    %cst = arith.constant 0.000000e+00 : f32
    %c1024_i32 = arith.constant 1024 : i32
    %cst_0 = arith.constant 1.024000e+03 : f32
    %c0 = arith.constant 0 : index
    %cst_1 = arith.constant 9.99999974E-6 : f32
    %0 = tensor.empty() : tensor<1xf32>
    %1 = linalg.fill ins(%cst_1 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %2 = linalg.fill ins(%cst_0 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %3 = arith.muli %arg10, %c1024_i32 : i32
    %4 = arith.index_cast %3 : i32 to index
    %reinterpret_cast = memref.reinterpret_cast %arg3 to offset: [%4], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1], offset: ?>>
    %alloc = memref.alloc() : memref<1024xf16>
    memref.copy %reinterpret_cast, %alloc : memref<1024xf16, strided<[1], offset: ?>> to memref<1024xf16>
    %5 = bufferization.to_tensor %alloc restrict writable : memref<1024xf16>
    %6 = arith.extf %5 : tensor<1024xf16> to tensor<1024xf32>
    %7 = arith.mulf %6, %6 : tensor<1024xf32>
    %8 = bufferization.alloc_tensor() : tensor<f32>
    %9 = linalg.fill ins(%cst : f32) outs(%8 : tensor<f32>) -> tensor<f32>
    %reduced = linalg.reduce ins(%7 : tensor<1024xf32>) outs(%9 : tensor<f32>) dimensions = [0] 
      (%in: f32, %init: f32) {
        %41 = arith.addf %in, %init : f32
        linalg.yield %41 : f32
      }
    %extracted = tensor.extract %reduced[] : tensor<f32>
    %10 = linalg.fill ins(%extracted : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %11 = arith.divf %10, %2 : tensor<1xf32>
    %extracted_2 = tensor.extract %11[%c0] : tensor<1xf32>
    %12 = linalg.fill ins(%extracted_2 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %13 = arith.addf %12, %1 : tensor<1xf32>
    %extracted_3 = tensor.extract %13[%c0] : tensor<1xf32>
    %14 = linalg.fill ins(%extracted_3 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %15 = math.sqrt %14 : tensor<1xf32>
    %extracted_4 = tensor.extract %15[%c0] : tensor<1xf32>
    %reinterpret_cast_5 = memref.reinterpret_cast %arg4 to offset: [%4], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1], offset: ?>>
    %alloc_6 = memref.alloc() : memref<1024xf16>
    memref.copy %reinterpret_cast_5, %alloc_6 : memref<1024xf16, strided<[1], offset: ?>> to memref<1024xf16>
    %16 = bufferization.to_tensor %alloc_6 restrict writable : memref<1024xf16>
    %reinterpret_cast_7 = memref.reinterpret_cast %arg5 to offset: [0], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1]>>
    %alloc_8 = memref.alloc() : memref<1024xf16>
    memref.copy %reinterpret_cast_7, %alloc_8 : memref<1024xf16, strided<[1]>> to memref<1024xf16>
    %17 = bufferization.to_tensor %alloc_8 restrict writable : memref<1024xf16>
    %18 = arith.extf %17 : tensor<1024xf16> to tensor<1024xf32>
    %19 = tensor.empty() : tensor<1024xf32>
    %20 = linalg.fill ins(%extracted_4 : f32) outs(%19 : tensor<1024xf32>) -> tensor<1024xf32>
    %21 = arith.divf %6, %20 : tensor<1024xf32>
    %22 = arith.mulf %21, %18 : tensor<1024xf32>
    %23 = arith.truncf %22 : tensor<1024xf32> to tensor<1024xf16>
    %24 = arith.addf %16, %23 : tensor<1024xf16>
    %reinterpret_cast_9 = memref.reinterpret_cast %arg2 to offset: [%4], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1], offset: ?>>
    bufferization.materialize_in_destination %24 in writable %reinterpret_cast_9 : (tensor<1024xf16>, memref<1024xf16, strided<[1], offset: ?>>) -> ()
    %25 = arith.extf %24 : tensor<1024xf16> to tensor<1024xf32>
    %26 = arith.mulf %25, %25 : tensor<1024xf32>
    %27 = bufferization.alloc_tensor() : tensor<f32>
    %28 = linalg.fill ins(%cst : f32) outs(%27 : tensor<f32>) -> tensor<f32>
    %reduced_10 = linalg.reduce ins(%26 : tensor<1024xf32>) outs(%28 : tensor<f32>) dimensions = [0] 
      (%in: f32, %init: f32) {
        %41 = arith.addf %in, %init : f32
        linalg.yield %41 : f32
      }
    %extracted_11 = tensor.extract %reduced_10[] : tensor<f32>
    %29 = linalg.fill ins(%extracted_11 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %30 = arith.divf %29, %2 : tensor<1xf32>
    %extracted_12 = tensor.extract %30[%c0] : tensor<1xf32>
    %31 = linalg.fill ins(%extracted_12 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %32 = arith.addf %31, %1 : tensor<1xf32>
    %extracted_13 = tensor.extract %32[%c0] : tensor<1xf32>
    %33 = linalg.fill ins(%extracted_13 : f32) outs(%0 : tensor<1xf32>) -> tensor<1xf32>
    %34 = math.sqrt %33 : tensor<1xf32>
    %extracted_14 = tensor.extract %34[%c0] : tensor<1xf32>
    %reinterpret_cast_15 = memref.reinterpret_cast %arg6 to offset: [0], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1]>>
    %alloc_16 = memref.alloc() : memref<1024xf16>
    memref.copy %reinterpret_cast_15, %alloc_16 : memref<1024xf16, strided<[1]>> to memref<1024xf16>
    %35 = bufferization.to_tensor %alloc_16 restrict writable : memref<1024xf16>
    %36 = arith.extf %35 : tensor<1024xf16> to tensor<1024xf32>
    %reinterpret_cast_17 = memref.reinterpret_cast %arg1 to offset: [%4], sizes: [1024], strides: [1] : memref<?xf16> to memref<1024xf16, strided<[1], offset: ?>>
    %37 = linalg.fill ins(%extracted_14 : f32) outs(%19 : tensor<1024xf32>) -> tensor<1024xf32>
    %38 = arith.divf %25, %37 : tensor<1024xf32>
    %39 = arith.mulf %38, %36 : tensor<1024xf32>
    %40 = arith.truncf %39 : tensor<1024xf32> to tensor<1024xf16>
    bufferization.materialize_in_destination %40 in writable %reinterpret_cast_17 : (tensor<1024xf16>, memref<1024xf16, strided<[1], offset: ?>>) -> ()
    return
  }
}

