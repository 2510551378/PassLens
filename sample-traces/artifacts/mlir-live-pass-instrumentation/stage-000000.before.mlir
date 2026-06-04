func.func @main(%arg0: i32) -> i32 {
  %c0_i32 = arith.constant 0 : i32
  %0 = arith.addi %arg0, %c0_i32 : i32
  return %0 : i32
}