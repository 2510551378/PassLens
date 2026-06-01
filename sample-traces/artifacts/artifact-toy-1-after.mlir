module {
  llvm.func @kernel(%arg0: i32) -> i32 {
    %0 = llvm.mlir.constant(1 : i32) : i32
    %1 = llvm.add %arg0, %0 : i32
    llvm.return %1 : i32
  }
}
