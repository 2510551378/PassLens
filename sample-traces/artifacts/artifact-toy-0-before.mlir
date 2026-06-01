module {
  func.func @kernel(%arg0: i32) -> i32 {
    %c0 = arith.constant 0 : i32
    %c1 = arith.constant 1 : i32
    %0 = arith.addi %arg0, %c0 : i32
    %1 = arith.addi %0, %c1 : i32
    return %1 : i32
  }
}
