module {
  func.func @select_same_val(%arg0: i1, %arg1: i64) -> i64 {
    %0 = arith.select %arg0, %arg1, %arg1 : i64
    return %0 : i64
  }
  func.func @select_cmp_eq_select(%arg0: i64, %arg1: i64) -> i64 {
    %0 = arith.cmpi eq, %arg0, %arg1 : i64
    %1 = arith.select %0, %arg0, %arg1 : i64
    return %1 : i64
  }
  func.func @select_cmp_ne_select(%arg0: i64, %arg1: i64) -> i64 {
    %0 = arith.cmpi ne, %arg0, %arg1 : i64
    %1 = arith.select %0, %arg0, %arg1 : i64
    return %1 : i64
  }
  func.func @select_extui(%arg0: i1) -> i64 {
    %c0_i64 = arith.constant 0 : i64
    %c1_i64 = arith.constant 1 : i64
    %0 = arith.select %arg0, %c1_i64, %c0_i64 : i64
    return %0 : i64
  }
  func.func @select_extui2(%arg0: i1) -> i64 {
    %c0_i64 = arith.constant 0 : i64
    %c1_i64 = arith.constant 1 : i64
    %0 = arith.select %arg0, %c0_i64, %c1_i64 : i64
    return %0 : i64
  }
  func.func @select_extui_i1(%arg0: i1) -> i1 {
    %false = arith.constant false
    %true = arith.constant true
    %0 = arith.select %arg0, %true, %false : i1
    return %0 : i1
  }
  func.func @select_no_fold_ui1(%arg0: i1) -> ui1 {
    %0 = "test.constant"() {value = 0 : i32} : () -> ui1
    %1 = "test.constant"() {value = 1 : i32} : () -> ui1
    %2 = arith.select %arg0, %1, %0 : ui1
    return %2 : ui1
  }
  func.func @select_cst_false_scalar(%arg0: i32, %arg1: i32) -> i32 {
    %false = arith.constant false
    %0 = arith.select %false, %arg0, %arg1 : i32
    return %0 : i32
  }
  func.func @select_cst_true_scalar(%arg0: i32, %arg1: i32) -> i32 {
    %true = arith.constant true
    %0 = arith.select %true, %arg0, %arg1 : i32
    return %0 : i32
  }
  func.func @select_cst_true_splat() -> vector<3xi32> {
    %cst = arith.constant dense<true> : vector<3xi1>
    %cst_0 = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %cst_1 = arith.constant dense<[4, 5, 6]> : vector<3xi32>
    %0 = arith.select %cst, %cst_0, %cst_1 : vector<3xi1>, vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @select_cst_vector_i32() -> vector<3xi32> {
    %cst = arith.constant dense<[true, false, true]> : vector<3xi1>
    %cst_0 = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %cst_1 = arith.constant dense<[4, 5, 6]> : vector<3xi32>
    %0 = arith.select %cst, %cst_0, %cst_1 : vector<3xi1>, vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @select_cst_vector_f32() -> vector<3xf32> {
    %cst = arith.constant dense<[false, true, false]> : vector<3xi1>
    %cst_0 = arith.constant dense<[1.000000e+00, 2.000000e+00, 3.000000e+00]> : vector<3xf32>
    %cst_1 = arith.constant dense<[4.000000e+00, 5.000000e+00, 6.000000e+00]> : vector<3xf32>
    %0 = arith.select %cst, %cst_0, %cst_1 : vector<3xi1>, vector<3xf32>
    return %0 : vector<3xf32>
  }
  func.func @selToNot(%arg0: i1) -> i1 {
    %true = arith.constant true
    %false = arith.constant false
    %0 = arith.select %arg0, %false, %true : i1
    return %0 : i1
  }
  func.func @redundantSelectTrue(%arg0: i1, %arg1: i32, %arg2: i32, %arg3: i32) -> i32 {
    %0 = arith.select %arg0, %arg1, %arg2 : i32
    %1 = arith.select %arg0, %0, %arg3 : i32
    return %1 : i32
  }
  func.func @redundantSelectFalse(%arg0: i1, %arg1: i32, %arg2: i32, %arg3: i32) -> i32 {
    %0 = arith.select %arg0, %arg1, %arg2 : i32
    %1 = arith.select %arg0, %arg3, %0 : i32
    return %1 : i32
  }
  func.func @selNotCond(%arg0: i1, %arg1: i32, %arg2: i32, %arg3: i32, %arg4: i32) -> (i32, i32) {
    %true = arith.constant true
    %0 = arith.xori %arg0, %true : i1
    %1 = arith.xori %true, %arg0 : i1
    %2 = arith.select %0, %arg1, %arg2 : i32
    %3 = arith.select %1, %arg3, %arg4 : i32
    return %2, %3 : i32, i32
  }
  func.func @cmpiI1eq(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi eq, %arg0, %true : i1
    return %0 : i1
  }
  func.func @cmpiI1eqVec(%arg0: vector<4xi1>) -> vector<4xi1> {
    %cst = arith.constant dense<true> : vector<4xi1>
    %0 = arith.cmpi eq, %arg0, %cst : vector<4xi1>
    return %0 : vector<4xi1>
  }
  func.func @cmpiI1ne(%arg0: i1) -> i1 {
    %false = arith.constant false
    %0 = arith.cmpi ne, %arg0, %false : i1
    return %0 : i1
  }
  func.func @cmpiI1neVec(%arg0: vector<4xi1>) -> vector<4xi1> {
    %cst = arith.constant dense<false> : vector<4xi1>
    %0 = arith.cmpi ne, %arg0, %cst : vector<4xi1>
    return %0 : vector<4xi1>
  }
  func.func @cmpiI1eqLhs(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi eq, %true, %arg0 : i1
    return %0 : i1
  }
  func.func @cmpiI1eqVecLhs(%arg0: vector<4xi1>) -> vector<4xi1> {
    %cst = arith.constant dense<true> : vector<4xi1>
    %0 = arith.cmpi eq, %cst, %arg0 : vector<4xi1>
    return %0 : vector<4xi1>
  }
  func.func @cmpiI1neLhs(%arg0: i1) -> i1 {
    %false = arith.constant false
    %0 = arith.cmpi ne, %false, %arg0 : i1
    return %0 : i1
  }
  func.func @cmpiI1neVecLhs(%arg0: vector<4xi1>) -> vector<4xi1> {
    %cst = arith.constant dense<false> : vector<4xi1>
    %0 = arith.cmpi ne, %cst, %arg0 : vector<4xi1>
    return %0 : vector<4xi1>
  }
  func.func @cmpi_equal_operands(%arg0: i64) -> (i1, i1, i1, i1, i1, i1, i1, i1, i1, i1) {
    %0 = arith.cmpi eq, %arg0, %arg0 : i64
    %1 = arith.cmpi sle, %arg0, %arg0 : i64
    %2 = arith.cmpi sge, %arg0, %arg0 : i64
    %3 = arith.cmpi ule, %arg0, %arg0 : i64
    %4 = arith.cmpi uge, %arg0, %arg0 : i64
    %5 = arith.cmpi ne, %arg0, %arg0 : i64
    %6 = arith.cmpi slt, %arg0, %arg0 : i64
    %7 = arith.cmpi sgt, %arg0, %arg0 : i64
    %8 = arith.cmpi ult, %arg0, %arg0 : i64
    %9 = arith.cmpi ugt, %arg0, %arg0 : i64
    return %0, %1, %2, %3, %4, %5, %6, %7, %8, %9 : i1, i1, i1, i1, i1, i1, i1, i1, i1, i1
  }
  func.func @cmpi_equal_vector_operands(%arg0: vector<1x8xi64>) -> (vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>) {
    %0 = arith.cmpi eq, %arg0, %arg0 : vector<1x8xi64>
    %1 = arith.cmpi sle, %arg0, %arg0 : vector<1x8xi64>
    %2 = arith.cmpi sge, %arg0, %arg0 : vector<1x8xi64>
    %3 = arith.cmpi ule, %arg0, %arg0 : vector<1x8xi64>
    %4 = arith.cmpi uge, %arg0, %arg0 : vector<1x8xi64>
    %5 = arith.cmpi ne, %arg0, %arg0 : vector<1x8xi64>
    %6 = arith.cmpi slt, %arg0, %arg0 : vector<1x8xi64>
    %7 = arith.cmpi sgt, %arg0, %arg0 : vector<1x8xi64>
    %8 = arith.cmpi ult, %arg0, %arg0 : vector<1x8xi64>
    %9 = arith.cmpi ugt, %arg0, %arg0 : vector<1x8xi64>
    return %0, %1, %2, %3, %4, %5, %6, %7, %8, %9 : vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>, vector<1x8xi1>
  }
  func.func @cmpi_const_right(%arg0: i64) -> (i1, i1, i1, i1, i1, i1, i1, i1, i1, i1) {
    %c1_i64 = arith.constant 1 : i64
    %0 = arith.cmpi eq, %c1_i64, %arg0 : i64
    %1 = arith.cmpi sle, %c1_i64, %arg0 : i64
    %2 = arith.cmpi sge, %c1_i64, %arg0 : i64
    %3 = arith.cmpi ule, %c1_i64, %arg0 : i64
    %4 = arith.cmpi uge, %c1_i64, %arg0 : i64
    %5 = arith.cmpi ne, %c1_i64, %arg0 : i64
    %6 = arith.cmpi slt, %c1_i64, %arg0 : i64
    %7 = arith.cmpi sgt, %c1_i64, %arg0 : i64
    %8 = arith.cmpi ult, %c1_i64, %arg0 : i64
    %9 = arith.cmpi ugt, %c1_i64, %arg0 : i64
    return %0, %1, %2, %3, %4, %5, %6, %7, %8, %9 : i1, i1, i1, i1, i1, i1, i1, i1, i1, i1
  }
  func.func @cmpOfExtSI(%arg0: i1) -> i1 {
    %0 = arith.extsi %arg0 : i1 to i64
    %c0_i64 = arith.constant 0 : i64
    %1 = arith.cmpi ne, %0, %c0_i64 : i64
    return %1 : i1
  }
  func.func @cmpOfExtUI(%arg0: i1) -> i1 {
    %0 = arith.extui %arg0 : i1 to i64
    %c0_i64 = arith.constant 0 : i64
    %1 = arith.cmpi ne, %0, %c0_i64 : i64
    return %1 : i1
  }
  func.func @cmpOfExtSIVector(%arg0: vector<4xi1>) -> vector<4xi1> {
    %0 = arith.extsi %arg0 : vector<4xi1> to vector<4xi64>
    %cst = arith.constant dense<0> : vector<4xi64>
    %1 = arith.cmpi ne, %0, %cst : vector<4xi64>
    return %1 : vector<4xi1>
  }
  func.func @cmpOfExtUIVector(%arg0: vector<4xi1>) -> vector<4xi1> {
    %0 = arith.extui %arg0 : vector<4xi1> to vector<4xi64>
    %cst = arith.constant dense<0> : vector<4xi64>
    %1 = arith.cmpi ne, %0, %cst : vector<4xi64>
    return %1 : vector<4xi1>
  }
  func.func @extSIOfExtUI(%arg0: i1) -> i64 {
    %0 = arith.extui %arg0 : i1 to i8
    %1 = arith.extsi %0 : i8 to i64
    return %1 : i64
  }
  func.func @extUIOfExtUI(%arg0: i1) -> i64 {
    %0 = arith.extui %arg0 : i1 to i8
    %1 = arith.extui %0 : i8 to i64
    return %1 : i64
  }
  func.func @extSIOfExtSI(%arg0: i1) -> i64 {
    %0 = arith.extsi %arg0 : i1 to i8
    %1 = arith.extsi %0 : i8 to i64
    return %1 : i64
  }
  func.func @cmpIExtSINE(%arg0: i8, %arg1: i8) -> i1 {
    %0 = arith.extsi %arg0 : i8 to i64
    %1 = arith.extsi %arg1 : i8 to i64
    %2 = arith.cmpi ne, %0, %1 : i64
    return %2 : i1
  }
  func.func @cmpIExtSIEQ(%arg0: i8, %arg1: i8) -> i1 {
    %0 = arith.extsi %arg0 : i8 to i64
    %1 = arith.extsi %arg1 : i8 to i64
    %2 = arith.cmpi eq, %0, %1 : i64
    return %2 : i1
  }
  func.func @cmpIExtUINE(%arg0: i8, %arg1: i8) -> i1 {
    %0 = arith.extui %arg0 : i8 to i64
    %1 = arith.extui %arg1 : i8 to i64
    %2 = arith.cmpi ne, %0, %1 : i64
    return %2 : i1
  }
  func.func @cmpIExtUIEQ(%arg0: i8, %arg1: i8) -> i1 {
    %0 = arith.extui %arg0 : i8 to i64
    %1 = arith.extui %arg1 : i8 to i64
    %2 = arith.cmpi eq, %0, %1 : i64
    return %2 : i1
  }
  func.func @cmpIFoldEQ() -> vector<3xi1> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %cst_0 = arith.constant dense<[1, 2, 4]> : vector<3xi32>
    %0 = arith.cmpi eq, %cst, %cst_0 : vector<3xi32>
    return %0 : vector<3xi1>
  }
  func.func @cmpIFoldNE() -> vector<3xi1> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %cst_0 = arith.constant dense<[1, 2, 4]> : vector<3xi32>
    %0 = arith.cmpi ne, %cst, %cst_0 : vector<3xi32>
    return %0 : vector<3xi1>
  }
  func.func @cmpIFoldSGE() -> vector<3xi1> {
    %cst = arith.constant dense<2> : vector<3xi32>
    %cst_0 = arith.constant dense<[1, 2, 4]> : vector<3xi32>
    %0 = arith.cmpi sge, %cst, %cst_0 : vector<3xi32>
    return %0 : vector<3xi1>
  }
  func.func @cmpIFoldULT() -> vector<3xi1> {
    %cst = arith.constant dense<2> : vector<3xi32>
    %cst_0 = arith.constant dense<1> : vector<3xi32>
    %0 = arith.cmpi ult, %cst, %cst_0 : vector<3xi32>
    return %0 : vector<3xi1>
  }
  func.func @andOfExtSI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extsi %arg0 : i8 to i64
    %1 = arith.extsi %arg1 : i8 to i64
    %2 = arith.andi %0, %1 : i64
    return %2 : i64
  }
  func.func @andOfExtUI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extui %arg0 : i8 to i64
    %1 = arith.extui %arg1 : i8 to i64
    %2 = arith.andi %0, %1 : i64
    return %2 : i64
  }
  func.func @orOfExtSI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extsi %arg0 : i8 to i64
    %1 = arith.extsi %arg1 : i8 to i64
    %2 = arith.ori %0, %1 : i64
    return %2 : i64
  }
  func.func @orOfExtUI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extui %arg0 : i8 to i64
    %1 = arith.extui %arg1 : i8 to i64
    %2 = arith.ori %0, %1 : i64
    return %2 : i64
  }
  func.func @indexCastOfSignExtend(%arg0: i8) -> index {
    %0 = arith.extsi %arg0 : i8 to i16
    %1 = arith.index_cast %0 : i16 to index
    return %1 : index
  }
  func.func @indexCastUIOfUnsignedExtend(%arg0: i8) -> index {
    %0 = arith.extui %arg0 : i8 to i16
    %1 = arith.index_castui %0 : i16 to index
    return %1 : index
  }
  func.func @indexCastFold() -> index {
    %c-2_i8 = arith.constant -2 : i8
    %0 = arith.index_cast %c-2_i8 : i8 to index
    return %0 : index
  }
  func.func @indexCastFoldIndexToInt() -> i32 {
    %c1 = arith.constant 1 : index
    %0 = arith.index_cast %c1 : index to i32
    return %0 : i32
  }
  func.func @indexCastFoldSplatVector() -> vector<3xindex> {
    %cst = arith.constant dense<42> : vector<3xi32>
    %0 = arith.index_cast %cst : vector<3xi32> to vector<3xindex>
    return %0 : vector<3xindex>
  }
  func.func @indexCastFoldVector() -> vector<3xindex> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %0 = arith.index_cast %cst : vector<3xi32> to vector<3xindex>
    return %0 : vector<3xindex>
  }
  func.func @indexCastFoldSplatVectorIndexToInt() -> vector<3xi32> {
    %cst = arith.constant dense<42> : vector<3xindex>
    %0 = arith.index_cast %cst : vector<3xindex> to vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @indexCastFoldVectorIndexToInt() -> vector<3xi32> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xindex>
    %0 = arith.index_cast %cst : vector<3xindex> to vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @indexCastUIFold() -> index {
    %c-2_i8 = arith.constant -2 : i8
    %0 = arith.index_castui %c-2_i8 : i8 to index
    return %0 : index
  }
  func.func @indexCastUIFoldSplatVector() -> vector<3xindex> {
    %cst = arith.constant dense<42> : vector<3xi32>
    %0 = arith.index_castui %cst : vector<3xi32> to vector<3xindex>
    return %0 : vector<3xindex>
  }
  func.func @indexCastUIFoldVector() -> vector<3xindex> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xi32>
    %0 = arith.index_castui %cst : vector<3xi32> to vector<3xindex>
    return %0 : vector<3xindex>
  }
  func.func @indexCastUIFoldIndexToInt() -> i32 {
    %c1 = arith.constant 1 : index
    %0 = arith.index_castui %c1 : index to i32
    return %0 : i32
  }
  func.func @indexCastUIFoldSplatVectorIndexToInt() -> vector<3xi32> {
    %cst = arith.constant dense<42> : vector<3xindex>
    %0 = arith.index_castui %cst : vector<3xindex> to vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @indexCastUIFoldVectorIndexToInt() -> vector<3xi32> {
    %cst = arith.constant dense<[1, 2, 3]> : vector<3xindex>
    %0 = arith.index_castui %cst : vector<3xindex> to vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @signExtendConstant() -> i16 {
    %c-2_i8 = arith.constant -2 : i8
    %0 = arith.extsi %c-2_i8 : i8 to i16
    return %0 : i16
  }
  func.func @signExtendConstantSplat() -> vector<4xi16> {
    %c-2_i8 = arith.constant -2 : i8
    %0 = vector.splat %c-2_i8 : vector<4xi8>
    %1 = arith.extsi %0 : vector<4xi8> to vector<4xi16>
    return %1 : vector<4xi16>
  }
  func.func @signExtendConstantVector() -> vector<4xi16> {
    %cst = arith.constant dense<[1, 3, 5, 7]> : vector<4xi8>
    %0 = arith.extsi %cst : vector<4xi8> to vector<4xi16>
    return %0 : vector<4xi16>
  }
  func.func @unsignedExtendConstant() -> i16 {
    %c2_i8 = arith.constant 2 : i8
    %0 = arith.extui %c2_i8 : i8 to i16
    return %0 : i16
  }
  func.func @unsignedExtendConstantSplat() -> vector<4xi16> {
    %c2_i8 = arith.constant 2 : i8
    %0 = vector.splat %c2_i8 : vector<4xi8>
    %1 = arith.extui %0 : vector<4xi8> to vector<4xi16>
    return %1 : vector<4xi16>
  }
  func.func @unsignedExtendConstantVector() -> vector<4xi16> {
    %cst = arith.constant dense<[1, 3, 5, 7]> : vector<4xi8>
    %0 = arith.extui %cst : vector<4xi8> to vector<4xi16>
    return %0 : vector<4xi16>
  }
  func.func @extFPConstant() -> f64 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.extf %cst : f32 to f64
    return %0 : f64
  }
  func.func @extFPVectorConstant() -> vector<2xf128> {
    %cst = arith.constant dense<[0.000000e+00, 1.000000e+00]> : vector<2xf80>
    %0 = arith.extf %cst : vector<2xf80> to vector<2xf128>
    return %0 : vector<2xf128>
  }
  func.func @truncConstant(%arg0: i8) -> i16 {
    %c-2_i32 = arith.constant -2 : i32
    %0 = arith.trunci %c-2_i32 : i32 to i16
    return %0 : i16
  }
  func.func @truncExtui(%arg0: i32) -> i32 {
    %0 = arith.extui %arg0 : i32 to i64
    %1 = arith.trunci %0 : i64 to i32
    return %1 : i32
  }
  func.func @truncExtui2(%arg0: i32) -> i16 {
    %0 = arith.extui %arg0 : i32 to i64
    %1 = arith.trunci %0 : i64 to i16
    return %1 : i16
  }
  func.func @truncExtui3(%arg0: i8) -> i16 {
    %0 = arith.extui %arg0 : i8 to i32
    %1 = arith.trunci %0 : i32 to i16
    return %1 : i16
  }
  func.func @truncExtuiVector(%arg0: vector<2xi32>) -> vector<2xi16> {
    %0 = arith.extui %arg0 : vector<2xi32> to vector<2xi64>
    %1 = arith.trunci %0 : vector<2xi64> to vector<2xi16>
    return %1 : vector<2xi16>
  }
  func.func @truncExtsi(%arg0: i32) -> i32 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.trunci %0 : i64 to i32
    return %1 : i32
  }
  func.func @truncExtsi2(%arg0: i32) -> i16 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.trunci %0 : i64 to i16
    return %1 : i16
  }
  func.func @truncExtsi3(%arg0: i8) -> i16 {
    %0 = arith.extsi %arg0 : i8 to i32
    %1 = arith.trunci %0 : i32 to i16
    return %1 : i16
  }
  func.func @truncExtsiVector(%arg0: vector<2xi32>) -> vector<2xi16> {
    %0 = arith.extsi %arg0 : vector<2xi32> to vector<2xi64>
    %1 = arith.trunci %0 : vector<2xi64> to vector<2xi16>
    return %1 : vector<2xi16>
  }
  func.func @truncConstantSplat() -> vector<4xi8> {
    %c-2_i16 = arith.constant -2 : i16
    %0 = vector.splat %c-2_i16 : vector<4xi16>
    %1 = arith.trunci %0 : vector<4xi16> to vector<4xi8>
    return %1 : vector<4xi8>
  }
  func.func @truncConstantVector() -> vector<4xi8> {
    %cst = arith.constant dense<[1, 3, 5, 7]> : vector<4xi16>
    %0 = arith.trunci %cst : vector<4xi16> to vector<4xi8>
    return %0 : vector<4xi8>
  }
  func.func @truncTrunc(%arg0: i64) -> i8 {
    %0 = arith.trunci %arg0 : i64 to i32
    %1 = arith.trunci %0 : i32 to i8
    return %1 : i8
  }
  func.func @truncFPConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPToNearestEvenConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst to_nearest_even : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPDownwardConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst downward : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPUpwardConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst upward : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPTowardZeroConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst toward_zero : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPToNearestAwayConstant() -> bf16 {
    %cst = arith.constant 1.000000e+00 : f32
    %0 = arith.truncf %cst to_nearest_away : f32 to bf16
    return %0 : bf16
  }
  func.func @truncFPVectorConstant() -> vector<2xbf16> {
    %cst = arith.constant dense<[0.000000e+00, 1.000000e+00]> : vector<2xf32>
    %0 = arith.truncf %cst : vector<2xf32> to vector<2xbf16>
    return %0 : vector<2xbf16>
  }
  func.func @truncFPConstantRounding() -> bf16 {
    %cst = arith.constant 1.444000e+25 : f32
    %0 = arith.truncf %cst : f32 to bf16
    return %0 : bf16
  }
  func.func @tripleAddAdd(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 : index
    %1 = arith.addi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleAddAddOvf1(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 overflow<nsw, nuw> : index
    %1 = arith.addi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleAddAddOvf2(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 overflow<nsw> : index
    %1 = arith.addi %c42, %0 overflow<nuw> : index
    return %1 : index
  }
  func.func @foldSubXX_tensor(%arg0: tensor<10xi32>, %arg1: tensor<?x?xi32>) -> (tensor<10xi32>, tensor<?x?xi32>) {
    %0 = arith.subi %arg0, %arg0 : tensor<10xi32>
    %1 = arith.subi %arg1, %arg1 : tensor<?x?xi32>
    return %0, %1 : tensor<10xi32>, tensor<?x?xi32>
  }
  func.func @foldSubXX_vector(%arg0: vector<8xi32>, %arg1: vector<[4]xi32>) -> (vector<8xi32>, vector<[4]xi32>) {
    %0 = arith.subi %arg0, %arg0 : vector<8xi32>
    %1 = arith.subi %arg1, %arg1 : vector<[4]xi32>
    return %0, %1 : vector<8xi32>, vector<[4]xi32>
  }
  func.func @tripleAddSub0(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 : index
    %1 = arith.addi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleAddSub0Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 overflow<nsw, nuw> : index
    %1 = arith.addi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleAddSub1(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 : index
    %1 = arith.addi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleAddSub1Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 overflow<nsw, nuw> : index
    %1 = arith.addi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubAdd0(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 : index
    %1 = arith.subi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleSubAdd0Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 overflow<nsw, nuw> : index
    %1 = arith.subi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubAdd1(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.addi %c17, %arg0 : index
    %1 = arith.subi %0, %c42 : index
    return %1 : index
  }
  func.func @subSub0(%arg0: index, %arg1: index) -> index {
    %0 = arith.subi %arg0, %arg1 : index
    %1 = arith.subi %0, %arg0 : index
    return %1 : index
  }
  func.func @subSub0Ovf(%arg0: index, %arg1: index) -> index {
    %0 = arith.subi %arg0, %arg1 overflow<nsw, nuw> : index
    %1 = arith.subi %0, %arg0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubSub0(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 : index
    %1 = arith.subi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleSubSub0Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 overflow<nsw, nuw> : index
    %1 = arith.subi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubSub1(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 : index
    %1 = arith.subi %0, %c42 : index
    return %1 : index
  }
  func.func @tripleSubSub1Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %c17, %arg0 overflow<nsw, nuw> : index
    %1 = arith.subi %0, %c42 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubSub2(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 : index
    %1 = arith.subi %c42, %0 : index
    return %1 : index
  }
  func.func @tripleSubSub2Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 overflow<nsw, nuw> : index
    %1 = arith.subi %c42, %0 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @tripleSubSub3(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 : index
    %1 = arith.subi %0, %c42 : index
    return %1 : index
  }
  func.func @tripleSubSub3Ovf(%arg0: index) -> index {
    %c17 = arith.constant 17 : index
    %c42 = arith.constant 42 : index
    %0 = arith.subi %arg0, %c17 overflow<nsw, nuw> : index
    %1 = arith.subi %0, %c42 overflow<nsw, nuw> : index
    return %1 : index
  }
  func.func @subAdd1(%arg0: index, %arg1: index) -> index {
    %0 = arith.addi %arg0, %arg1 : index
    %1 = arith.subi %0, %arg1 : index
    return %1 : index
  }
  func.func @subAdd2(%arg0: index, %arg1: index) -> index {
    %0 = arith.addi %arg0, %arg1 : index
    %1 = arith.subi %0, %arg0 : index
    return %1 : index
  }
  func.func @doubleAddSub1(%arg0: index, %arg1: index) -> index {
    %0 = arith.subi %arg0, %arg1 : index
    %1 = arith.addi %0, %arg1 : index
    return %1 : index
  }
  func.func @doubleAddSub2(%arg0: index, %arg1: index) -> index {
    %0 = arith.subi %arg0, %arg1 : index
    %1 = arith.addi %arg1, %0 : index
    return %1 : index
  }
  func.func @tripleMulIMulIIndex(%arg0: index) -> index {
    %c3 = arith.constant 3 : index
    %c5 = arith.constant 5 : index
    %0 = arith.muli %arg0, %c3 : index
    %1 = arith.muli %0, %c5 : index
    return %1 : index
  }
  func.func @tripleMulIMulII32(%arg0: i32) -> i32 {
    %c-3_i32 = arith.constant -3 : i32
    %c7_i32 = arith.constant 7 : i32
    %0 = arith.muli %arg0, %c-3_i32 : i32
    %1 = arith.muli %0, %c7_i32 : i32
    return %1 : i32
  }
  func.func @tripleMulLargeInt(%arg0: i256) -> i256 {
    %c3618502788666131213697322783095070105623107215331596699973092056135872020481_i256 = arith.constant 3618502788666131213697322783095070105623107215331596699973092056135872020481 : i256
    %c1_i256 = arith.constant 1 : i256
    %0 = arith.addi %arg0, %c3618502788666131213697322783095070105623107215331596699973092056135872020481_i256 : i256
    %1 = arith.addi %0, %c1_i256 : i256
    return %1 : i256
  }
  func.func @addiMuliToSubiRhsI32(%arg0: i32, %arg1: i32) -> i32 {
    %c-1_i32 = arith.constant -1 : i32
    %0 = arith.muli %arg1, %c-1_i32 : i32
    %1 = arith.addi %arg0, %0 : i32
    return %1 : i32
  }
  func.func @addiMuliToSubiRhsIndex(%arg0: index, %arg1: index) -> index {
    %c-1 = arith.constant -1 : index
    %0 = arith.muli %arg1, %c-1 : index
    %1 = arith.addi %arg0, %0 : index
    return %1 : index
  }
  func.func @addiMuliToSubiRhsVector(%arg0: vector<3xi64>, %arg1: vector<3xi64>) -> vector<3xi64> {
    %cst = arith.constant dense<-1> : vector<3xi64>
    %0 = arith.muli %arg1, %cst : vector<3xi64>
    %1 = arith.addi %arg0, %0 : vector<3xi64>
    return %1 : vector<3xi64>
  }
  func.func @addiMuliToSubiLhsI32(%arg0: i32, %arg1: i32) -> i32 {
    %c-1_i32 = arith.constant -1 : i32
    %0 = arith.muli %arg1, %c-1_i32 : i32
    %1 = arith.addi %0, %arg0 : i32
    return %1 : i32
  }
  func.func @addiMuliToSubiLhsIndex(%arg0: index, %arg1: index) -> index {
    %c-1 = arith.constant -1 : index
    %0 = arith.muli %arg1, %c-1 : index
    %1 = arith.addi %0, %arg0 : index
    return %1 : index
  }
  func.func @addiMuliToSubiLhsVector(%arg0: vector<3xi64>, %arg1: vector<3xi64>) -> vector<3xi64> {
    %cst = arith.constant dense<-1> : vector<3xi64>
    %0 = arith.muli %arg1, %cst : vector<3xi64>
    %1 = arith.addi %0, %arg0 : vector<3xi64>
    return %1 : vector<3xi64>
  }
  func.func @adduiExtendedZeroRhs(%arg0: i32) -> (i32, i1) {
    %c0_i32 = arith.constant 0 : i32
    %sum, %overflow = arith.addui_extended %arg0, %c0_i32 : i32, i1
    return %sum, %overflow : i32, i1
  }
  func.func @adduiExtendedZeroRhsSplat(%arg0: vector<4xi32>) -> (vector<4xi32>, vector<4xi1>) {
    %cst = arith.constant dense<0> : vector<4xi32>
    %sum, %overflow = arith.addui_extended %arg0, %cst : vector<4xi32>, vector<4xi1>
    return %sum, %overflow : vector<4xi32>, vector<4xi1>
  }
  func.func @adduiExtendedZeroLhs(%arg0: i32) -> (i32, i1) {
    %c0_i32 = arith.constant 0 : i32
    %sum, %overflow = arith.addui_extended %c0_i32, %arg0 : i32, i1
    return %sum, %overflow : i32, i1
  }
  func.func @adduiExtendedUnusedOverflowScalar(%arg0: i32, %arg1: i32) -> i32 {
    %sum, %overflow = arith.addui_extended %arg0, %arg1 : i32, i1
    return %sum : i32
  }
  func.func @adduiExtendedUnusedOverflowVector(%arg0: vector<3xi32>, %arg1: vector<3xi32>) -> vector<3xi32> {
    %sum, %overflow = arith.addui_extended %arg0, %arg1 : vector<3xi32>, vector<3xi1>
    return %sum : vector<3xi32>
  }
  func.func @adduiExtendedConstants() -> (i32, i1) {
    %c13_i32 = arith.constant 13 : i32
    %c37_i32 = arith.constant 37 : i32
    %sum, %overflow = arith.addui_extended %c13_i32, %c37_i32 : i32, i1
    return %sum, %overflow : i32, i1
  }
  func.func @adduiExtendedConstantsOverflow1() -> (i32, i1) {
    %c-1_i32 = arith.constant -1 : i32
    %c1_i32 = arith.constant 1 : i32
    %sum, %overflow = arith.addui_extended %c-1_i32, %c1_i32 : i32, i1
    return %sum, %overflow : i32, i1
  }
  func.func @adduiExtendedConstantsOverflow2() -> (i32, i1) {
    %c-1_i32 = arith.constant -1 : i32
    %sum, %overflow = arith.addui_extended %c-1_i32, %c-1_i32 : i32, i1
    return %sum, %overflow : i32, i1
  }
  func.func @adduiExtendedConstantsOverflowVector() -> (vector<4xi32>, vector<4xi1>) {
    %cst = arith.constant dense<[1, 3, 3, 7]> : vector<4xi32>
    %cst_0 = arith.constant dense<[0, 3, -1, 7]> : vector<4xi32>
    %sum, %overflow = arith.addui_extended %cst, %cst_0 : vector<4xi32>, vector<4xi1>
    return %sum, %overflow : vector<4xi32>, vector<4xi1>
  }
  func.func @adduiExtendedConstantsSplatVector() -> (vector<4xi32>, vector<4xi1>) {
    %cst = arith.constant dense<1> : vector<4xi32>
    %cst_0 = arith.constant dense<2> : vector<4xi32>
    %sum, %overflow = arith.addui_extended %cst, %cst_0 : vector<4xi32>, vector<4xi1>
    return %sum, %overflow : vector<4xi32>, vector<4xi1>
  }
  func.func @mulsiExtendedZeroRhs(%arg0: i32) -> (i32, i32) {
    %c0_i32 = arith.constant 0 : i32
    %low, %high = arith.mulsi_extended %arg0, %c0_i32 : i32
    return %low, %high : i32, i32
  }
  func.func @mulsiExtendedZeroRhsSplat(%arg0: vector<3xi32>) -> (vector<3xi32>, vector<3xi32>) {
    %cst = arith.constant dense<0> : vector<3xi32>
    %low, %high = arith.mulsi_extended %arg0, %cst : vector<3xi32>
    return %low, %high : vector<3xi32>, vector<3xi32>
  }
  func.func @mulsiExtendedZeroLhs(%arg0: i32) -> (i32, i32) {
    %c0_i32 = arith.constant 0 : i32
    %low, %high = arith.mulsi_extended %c0_i32, %arg0 : i32
    return %low, %high : i32, i32
  }
  func.func @mulsiExtendedOneRhs(%arg0: i32) -> (i32, i32) {
    %c1_i32 = arith.constant 1 : i32
    %low, %high = arith.mulsi_extended %arg0, %c1_i32 : i32
    return %low, %high : i32, i32
  }
  func.func @mulsiExtendedOneRhsSplat(%arg0: vector<3xi32>) -> (vector<3xi32>, vector<3xi32>) {
    %cst = arith.constant dense<1> : vector<3xi32>
    %low, %high = arith.mulsi_extended %arg0, %cst : vector<3xi32>
    return %low, %high : vector<3xi32>, vector<3xi32>
  }
  func.func @mulsiExtendedOneRhsI1(%arg0: i1) -> (i1, i1) {
    %true = arith.constant true
    %low, %high = arith.mulsi_extended %arg0, %true : i1
    return %low, %high : i1, i1
  }
  func.func @mulsiExtendedOneRhsSplatI1(%arg0: vector<3xi1>) -> (vector<3xi1>, vector<3xi1>) {
    %cst = arith.constant dense<true> : vector<3xi1>
    %low, %high = arith.mulsi_extended %arg0, %cst : vector<3xi1>
    return %low, %high : vector<3xi1>, vector<3xi1>
  }
  func.func @mulsiExtendedUnusedHigh(%arg0: i32) -> i32 {
    %low, %high = arith.mulsi_extended %arg0, %arg0 : i32
    return %low : i32
  }
  func.func @mulsiExtendedScalarConstants() -> (i8, i8) {
    %c57_i8 = arith.constant 57 : i8
    %c-13_i8 = arith.constant -13 : i8
    %low, %high = arith.mulsi_extended %c57_i8, %c-13_i8 : i8
    return %low, %high : i8, i8
  }
  func.func @mulsiExtendedVectorConstants() -> (vector<3xi8>, vector<3xi8>) {
    %cst = arith.constant dense<[5, 37, -17]> : vector<3xi8>
    %cst_0 = arith.constant dense<[13, 99, -2]> : vector<3xi8>
    %low, %high = arith.mulsi_extended %cst, %cst_0 : vector<3xi8>
    return %low, %high : vector<3xi8>, vector<3xi8>
  }
  func.func @muluiExtendedZeroRhs(%arg0: i32) -> (i32, i32) {
    %c0_i32 = arith.constant 0 : i32
    %low, %high = arith.mului_extended %arg0, %c0_i32 : i32
    return %low, %high : i32, i32
  }
  func.func @muluiExtendedZeroRhsSplat(%arg0: vector<3xi32>) -> (vector<3xi32>, vector<3xi32>) {
    %cst = arith.constant dense<0> : vector<3xi32>
    %low, %high = arith.mului_extended %arg0, %cst : vector<3xi32>
    return %low, %high : vector<3xi32>, vector<3xi32>
  }
  func.func @muluiExtendedZeroLhs(%arg0: i32) -> (i32, i32) {
    %c0_i32 = arith.constant 0 : i32
    %low, %high = arith.mului_extended %c0_i32, %arg0 : i32
    return %low, %high : i32, i32
  }
  func.func @muluiExtendedOneRhs(%arg0: i32) -> (i32, i32) {
    %c1_i32 = arith.constant 1 : i32
    %low, %high = arith.mului_extended %arg0, %c1_i32 : i32
    return %low, %high : i32, i32
  }
  func.func @muluiExtendedOneRhsSplat(%arg0: vector<3xi32>) -> (vector<3xi32>, vector<3xi32>) {
    %cst = arith.constant dense<1> : vector<3xi32>
    %low, %high = arith.mului_extended %arg0, %cst : vector<3xi32>
    return %low, %high : vector<3xi32>, vector<3xi32>
  }
  func.func @muluiExtendedOneLhs(%arg0: i32) -> (i32, i32) {
    %c1_i32 = arith.constant 1 : i32
    %low, %high = arith.mului_extended %c1_i32, %arg0 : i32
    return %low, %high : i32, i32
  }
  func.func @muluiExtendedUnusedHigh(%arg0: i32) -> i32 {
    %low, %high = arith.mului_extended %arg0, %arg0 : i32
    return %low : i32
  }
  func.func @muluiExtendedUnusedLow(%arg0: i32) -> i32 {
    %low, %high = arith.mului_extended %arg0, %arg0 : i32
    return %high : i32
  }
  func.func @muluiExtendedScalarConstants() -> (i8, i8) {
    %c57_i8 = arith.constant 57 : i8
    %c-123_i8 = arith.constant -123 : i8
    %low, %high = arith.mului_extended %c57_i8, %c-123_i8 : i8
    return %low, %high : i8, i8
  }
  func.func @muluiExtendedVectorConstants() -> (vector<3xi8>, vector<3xi8>) {
    %cst = arith.constant dense<[5, 37, -1]> : vector<3xi8>
    %cst_0 = arith.constant dense<[13, 99, -1]> : vector<3xi8>
    %low, %high = arith.mului_extended %cst, %cst_0 : vector<3xi8>
    return %low, %high : vector<3xi8>, vector<3xi8>
  }
  func.func @notCmpEQ(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi eq, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpEQ2(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi eq, %arg0, %arg1 : i8
    %1 = arith.xori %true, %0 : i1
    return %1 : i1
  }
  func.func @notCmpNE(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi ne, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpSLT(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi slt, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpSLE(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi sle, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpSGT(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi sgt, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpSGE(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi sge, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpULT(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi ult, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpULE(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi ule, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpUGT(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi ugt, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @notCmpUGE(%arg0: i8, %arg1: i8) -> i1 {
    %true = arith.constant true
    %0 = arith.cmpi uge, %arg0, %arg1 : i8
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @xorxor(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.xori %arg0, %true : i1
    %1 = arith.xori %0, %true : i1
    return %1 : i1
  }
  func.func @xorOfExtSI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extsi %arg0 : i8 to i64
    %1 = arith.extsi %arg1 : i8 to i64
    %2 = arith.xori %0, %1 : i64
    return %2 : i64
  }
  func.func @xorOfExtUI(%arg0: i8, %arg1: i8) -> i64 {
    %0 = arith.extui %arg0 : i8 to i64
    %1 = arith.extui %arg1 : i8 to i64
    %2 = arith.xori %0, %1 : i64
    return %2 : i64
  }
  func.func @bitcastSameType(%arg0: f32) -> f32 {
    %0 = arith.bitcast %arg0 : f32 to f32
    return %0 : f32
  }
  func.func @bitcastConstantFPtoI() -> i32 {
    %cst = arith.constant 0.000000e+00 : f32
    %0 = arith.bitcast %cst : f32 to i32
    return %0 : i32
  }
  func.func @bitcastConstantItoFP() -> f32 {
    %c0_i32 = arith.constant 0 : i32
    %0 = arith.bitcast %c0_i32 : i32 to f32
    return %0 : f32
  }
  func.func @bitcastConstantFPtoFP() -> f16 {
    %cst = arith.constant 0.000000e+00 : bf16
    %0 = arith.bitcast %cst : bf16 to f16
    return %0 : f16
  }
  func.func @bitcastConstantVecFPtoI() -> vector<3xf32> {
    %cst = arith.constant dense<0> : vector<3xi32>
    %0 = arith.bitcast %cst : vector<3xi32> to vector<3xf32>
    return %0 : vector<3xf32>
  }
  func.func @bitcastConstantVecItoFP() -> vector<3xi32> {
    %cst = arith.constant dense<0.000000e+00> : vector<3xf32>
    %0 = arith.bitcast %cst : vector<3xf32> to vector<3xi32>
    return %0 : vector<3xi32>
  }
  func.func @bitcastConstantVecFPtoFP() -> vector<3xbf16> {
    %cst = arith.constant dense<0.000000e+00> : vector<3xf16>
    %0 = arith.bitcast %cst : vector<3xf16> to vector<3xbf16>
    return %0 : vector<3xbf16>
  }
  func.func @bitcastBackAndForth(%arg0: i32) -> i32 {
    %0 = arith.bitcast %arg0 : i32 to f32
    %1 = arith.bitcast %0 : f32 to i32
    return %1 : i32
  }
  func.func @bitcastOfBitcast(%arg0: i16) -> i16 {
    %0 = arith.bitcast %arg0 : i16 to f16
    %1 = arith.bitcast %0 : f16 to bf16
    %2 = arith.bitcast %1 : bf16 to i16
    return %2 : i16
  }
  func.func @test_maxsi(%arg0: i8) -> (i8, i8, i8, i8) {
    %c127_i8 = arith.constant 127 : i8
    %c-128_i8 = arith.constant -128 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.maxsi %arg0, %arg0 : i8
    %1 = arith.maxsi %arg0, %c127_i8 : i8
    %2 = arith.maxsi %arg0, %c-128_i8 : i8
    %3 = arith.maxsi %arg0, %c42_i8 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_maxsi2(%arg0: i8) -> (i8, i8, i8, i8) {
    %c127_i8 = arith.constant 127 : i8
    %c-128_i8 = arith.constant -128 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.maxsi %arg0, %arg0 : i8
    %1 = arith.maxsi %c127_i8, %arg0 : i8
    %2 = arith.maxsi %c-128_i8, %arg0 : i8
    %3 = arith.maxsi %c42_i8, %arg0 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_maxui(%arg0: i8) -> (i8, i8, i8, i8) {
    %c-1_i8 = arith.constant -1 : i8
    %c0_i8 = arith.constant 0 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.maxui %arg0, %arg0 : i8
    %1 = arith.maxui %arg0, %c-1_i8 : i8
    %2 = arith.maxui %arg0, %c0_i8 : i8
    %3 = arith.maxui %arg0, %c42_i8 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_maxui2(%arg0: i8) -> (i8, i8, i8, i8) {
    %c-1_i8 = arith.constant -1 : i8
    %c0_i8 = arith.constant 0 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.maxui %arg0, %arg0 : i8
    %1 = arith.maxui %c-1_i8, %arg0 : i8
    %2 = arith.maxui %c0_i8, %arg0 : i8
    %3 = arith.maxui %c42_i8, %arg0 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_minsi(%arg0: i8) -> (i8, i8, i8, i8) {
    %c127_i8 = arith.constant 127 : i8
    %c-128_i8 = arith.constant -128 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.minsi %arg0, %arg0 : i8
    %1 = arith.minsi %arg0, %c127_i8 : i8
    %2 = arith.minsi %arg0, %c-128_i8 : i8
    %3 = arith.minsi %arg0, %c42_i8 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_minsi2(%arg0: i8) -> (i8, i8, i8, i8) {
    %c127_i8 = arith.constant 127 : i8
    %c-128_i8 = arith.constant -128 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.minsi %arg0, %arg0 : i8
    %1 = arith.minsi %c127_i8, %arg0 : i8
    %2 = arith.minsi %c-128_i8, %arg0 : i8
    %3 = arith.minsi %c42_i8, %arg0 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_minui(%arg0: i8) -> (i8, i8, i8, i8) {
    %c-1_i8 = arith.constant -1 : i8
    %c0_i8 = arith.constant 0 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.minui %arg0, %arg0 : i8
    %1 = arith.minui %arg0, %c-1_i8 : i8
    %2 = arith.minui %arg0, %c0_i8 : i8
    %3 = arith.minui %arg0, %c42_i8 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_minui2(%arg0: i8) -> (i8, i8, i8, i8) {
    %c-1_i8 = arith.constant -1 : i8
    %c0_i8 = arith.constant 0 : i8
    %c42_i8 = arith.constant 42 : i8
    %0 = arith.minui %arg0, %arg0 : i8
    %1 = arith.minui %c-1_i8, %arg0 : i8
    %2 = arith.minui %c0_i8, %arg0 : i8
    %3 = arith.minui %c42_i8, %arg0 : i8
    return %0, %1, %2, %3 : i8, i8, i8, i8
  }
  func.func @test_minimumf(%arg0: f32) -> (f32, f32, f32) {
    %cst = arith.constant 0.000000e+00 : f32
    %cst_0 = arith.constant 0x7F800000 : f32
    %0 = arith.minimumf %cst, %arg0 : f32
    %1 = arith.minimumf %arg0, %arg0 : f32
    %2 = arith.minimumf %cst_0, %arg0 : f32
    return %0, %1, %2 : f32, f32, f32
  }
  func.func @test_maximumf(%arg0: f32) -> (f32, f32, f32) {
    %cst = arith.constant 0.000000e+00 : f32
    %cst_0 = arith.constant 0xFF800000 : f32
    %0 = arith.maximumf %cst, %arg0 : f32
    %1 = arith.maximumf %arg0, %arg0 : f32
    %2 = arith.maximumf %cst_0, %arg0 : f32
    return %0, %1, %2 : f32, f32, f32
  }
  func.func @test_minnumf(%arg0: f32) -> (f32, f32, f32, f32) {
    %cst = arith.constant 0.000000e+00 : f32
    %cst_0 = arith.constant 0x7F800000 : f32
    %cst_1 = arith.constant 0x7FC00000 : f32
    %0 = arith.minnumf %cst, %arg0 : f32
    %1 = arith.minnumf %arg0, %arg0 : f32
    %2 = arith.minnumf %cst_0, %arg0 : f32
    %3 = arith.minnumf %cst_1, %arg0 : f32
    return %0, %1, %2, %3 : f32, f32, f32, f32
  }
  func.func @test_maxnumf(%arg0: f32) -> (f32, f32, f32, f32) {
    %cst = arith.constant 0.000000e+00 : f32
    %cst_0 = arith.constant 0xFF800000 : f32
    %cst_1 = arith.constant 0x7FC00000 : f32
    %0 = arith.maxnumf %cst, %arg0 : f32
    %1 = arith.maxnumf %arg0, %arg0 : f32
    %2 = arith.maxnumf %cst_0, %arg0 : f32
    %3 = arith.maxnumf %cst_1, %arg0 : f32
    return %0, %1, %2, %3 : f32, f32, f32, f32
  }
  func.func @test_addf(%arg0: f32) -> (f32, f32, f32, f32) {
    %cst = arith.constant 0.000000e+00 : f32
    %cst_0 = arith.constant -0.000000e+00 : f32
    %cst_1 = arith.constant 1.000000e+00 : f32
    %0 = arith.addf %cst, %arg0 : f32
    %1 = arith.addf %arg0, %cst_0 : f32
    %2 = arith.addf %cst_0, %arg0 : f32
    %3 = arith.addf %cst_1, %cst_1 : f32
    return %0, %1, %2, %3 : f32, f32, f32, f32
  }
  func.func @test_subf(%arg0: f16) -> (f16, f16, f16) {
    %cst = arith.constant 0.000000e+00 : f16
    %cst_0 = arith.constant -0.000000e+00 : f16
    %cst_1 = arith.constant 1.000000e+00 : f16
    %0 = arith.subf %arg0, %cst : f16
    %1 = arith.subf %arg0, %cst_0 : f16
    %2 = arith.subf %cst, %cst_1 : f16
    return %0, %1, %2 : f16, f16, f16
  }
  func.func @test_mulf(%arg0: f32) -> (f32, f32, f32, f32) {
    %cst = arith.constant 1.000000e+00 : f32
    %cst_0 = arith.constant 2.000000e+00 : f32
    %0 = arith.mulf %cst_0, %arg0 : f32
    %1 = arith.mulf %arg0, %cst : f32
    %2 = arith.mulf %cst, %arg0 : f32
    %3 = arith.mulf %cst_0, %cst_0 : f32
    return %0, %1, %2, %3 : f32, f32, f32, f32
  }
  func.func @test_mulf1(%arg0: f32, %arg1: f32) -> f32 {
    %0 = arith.negf %arg0 : f32
    %1 = arith.negf %arg1 : f32
    %2 = arith.mulf %0, %1 : f32
    return %2 : f32
  }
  func.func @test_divf(%arg0: f64) -> (f64, f64) {
    %cst = arith.constant 1.000000e+00 : f64
    %cst_0 = arith.constant 2.000000e+00 : f64
    %0 = arith.divf %arg0, %cst : f64
    %1 = arith.divf %cst, %cst_0 : f64
    return %0, %1 : f64, f64
  }
  func.func @test_divf1(%arg0: f32, %arg1: f32) -> f32 {
    %0 = arith.negf %arg0 : f32
    %1 = arith.negf %arg1 : f32
    %2 = arith.divf %0, %1 : f32
    return %2 : f32
  }
  func.func @fold_divui_of_muli_0(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 overflow<nuw> : index
    %1 = arith.divui %0, %arg0 : index
    return %1 : index
  }
  func.func @fold_divui_of_muli_1(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 overflow<nuw> : index
    %1 = arith.divui %0, %arg1 : index
    return %1 : index
  }
  func.func @fold_divsi_of_muli_0(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 overflow<nsw> : index
    %1 = arith.divsi %0, %arg0 : index
    return %1 : index
  }
  func.func @fold_divsi_of_muli_1(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 overflow<nsw> : index
    %1 = arith.divsi %0, %arg1 : index
    return %1 : index
  }
  func.func @no_fold_divui_of_muli(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 : index
    %1 = arith.divui %0, %arg0 : index
    return %1 : index
  }
  func.func @no_fold_divsi_of_muli(%arg0: index, %arg1: index) -> index {
    %0 = arith.muli %arg0, %arg1 : index
    %1 = arith.divsi %0, %arg0 : index
    return %1 : index
  }
  func.func @test_cmpf(%arg0: f32) -> (i1, i1, i1, i1) {
    %cst = arith.constant 0x7FFFFFFF : f32
    %0 = arith.cmpf olt, %cst, %arg0 : f32
    %1 = arith.cmpf olt, %arg0, %cst : f32
    %2 = arith.cmpf ugt, %cst, %arg0 : f32
    %3 = arith.cmpf ugt, %arg0, %cst : f32
    return %0, %1, %2, %3 : i1, i1, i1, i1
  }
  func.func @constant_FPtoUI() -> i32 {
    %cst = arith.constant 2.000000e+00 : f32
    %0 = arith.fptoui %cst : f32 to i32
    return %0 : i32
  }
  func.func @constant_FPtoUI_splat() -> vector<4xi32> {
    %cst = arith.constant 2.000000e+00 : f32
    %0 = vector.splat %cst : vector<4xf32>
    %1 = arith.fptoui %0 : vector<4xf32> to vector<4xi32>
    return %1 : vector<4xi32>
  }
  func.func @constant_FPtoUI_vector() -> vector<4xi32> {
    %cst = arith.constant dense<[1.000000e+00, 3.000000e+00, 5.000000e+00, 7.000000e+00]> : vector<4xf32>
    %0 = arith.fptoui %cst : vector<4xf32> to vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @invalid_constant_FPtoUI() -> i32 {
    %cst = arith.constant -2.000000e+00 : f32
    %0 = arith.fptoui %cst : f32 to i32
    return %0 : i32
  }
  func.func @constant_FPtoSI() -> i32 {
    %cst = arith.constant -2.000000e+00 : f32
    %0 = arith.fptosi %cst : f32 to i32
    return %0 : i32
  }
  func.func @constant_FPtoSI_splat() -> vector<4xi32> {
    %cst = arith.constant -2.000000e+00 : f32
    %0 = vector.splat %cst : vector<4xf32>
    %1 = arith.fptosi %0 : vector<4xf32> to vector<4xi32>
    return %1 : vector<4xi32>
  }
  func.func @constant_FPtoSI_vector() -> vector<4xi32> {
    %cst = arith.constant dense<[-1.000000e+00, -3.000000e+00, -5.000000e+00, -7.000000e+00]> : vector<4xf32>
    %0 = arith.fptosi %cst : vector<4xf32> to vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @invalid_constant_FPtoSI() -> i8 {
    %cst = arith.constant 2.000000e+10 : f32
    %0 = arith.fptosi %cst : f32 to i8
    return %0 : i8
  }
  func.func @constant_SItoFP() -> f32 {
    %c-2_i32 = arith.constant -2 : i32
    %0 = arith.sitofp %c-2_i32 : i32 to f32
    return %0 : f32
  }
  func.func @constant_SItoFP_splat() -> vector<4xf32> {
    %c2_i32 = arith.constant 2 : i32
    %0 = vector.splat %c2_i32 : vector<4xi32>
    %1 = arith.sitofp %0 : vector<4xi32> to vector<4xf32>
    return %1 : vector<4xf32>
  }
  func.func @constant_SItoFP_vector() -> vector<4xf32> {
    %cst = arith.constant dense<[1, 3, 5, 7]> : vector<4xi32>
    %0 = arith.sitofp %cst : vector<4xi32> to vector<4xf32>
    return %0 : vector<4xf32>
  }
  func.func @constant_UItoFP() -> f32 {
    %c2_i32 = arith.constant 2 : i32
    %0 = arith.uitofp %c2_i32 : i32 to f32
    return %0 : f32
  }
  func.func @constant_UItoFP_splat() -> vector<4xf32> {
    %c2_i32 = arith.constant 2 : i32
    %0 = vector.splat %c2_i32 : vector<4xi32>
    %1 = arith.uitofp %0 : vector<4xi32> to vector<4xf32>
    return %1 : vector<4xf32>
  }
  func.func @constant_UItoFP_vector() -> vector<4xf32> {
    %cst = arith.constant dense<[1, 3, 5, 7]> : vector<4xi32>
    %0 = arith.uitofp %cst : vector<4xi32> to vector<4xf32>
    return %0 : vector<4xf32>
  }
  func.func @test1(%arg0: i32) -> i1 {
    %cst = arith.constant 0.000000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf ole, %0, %cst : f64
    return %1 : i1
  }
  func.func @test2(%arg0: i32) -> i1 {
    %cst = arith.constant 0.000000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf olt, %0, %cst : f64
    return %1 : i1
  }
  func.func @test3(%arg0: i32) -> i1 {
    %cst = arith.constant 0.000000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf oge, %0, %cst : f64
    return %1 : i1
  }
  func.func @test4(%arg0: i32) -> i1 {
    %cst = arith.constant 0.000000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf ogt, %0, %cst : f64
    return %1 : i1
  }
  func.func @test5(%arg0: i32) -> i1 {
    %cst = arith.constant -4.400000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf ogt, %0, %cst : f64
    return %1 : i1
  }
  func.func @test6(%arg0: i32) -> i1 {
    %cst = arith.constant -4.400000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf olt, %0, %cst : f64
    return %1 : i1
  }
  func.func @test7(%arg0: i32) -> i1 {
    %cst = arith.constant 3.200000e+00 : f64
    %0 = arith.uitofp %arg0 : i32 to f64
    %1 = arith.cmpf oge, %0, %cst : f64
    return %1 : i1
  }
  func.func @foldShl() -> i64 {
    %c1_i64 = arith.constant 1 : i64
    %c32_i64 = arith.constant 32 : i64
    %0 = arith.shli %c1_i64, %c32_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShl() -> i64 {
    %c1_i64 = arith.constant 1 : i64
    %c132_i64 = arith.constant 132 : i64
    %0 = arith.shli %c1_i64, %c132_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShl2() -> i64 {
    %c1_i64 = arith.constant 1 : i64
    %c-32_i64 = arith.constant -32 : i64
    %0 = arith.shli %c1_i64, %c-32_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShl3() -> i64 {
    %c1_i64 = arith.constant 1 : i64
    %c64_i64 = arith.constant 64 : i64
    %0 = arith.shli %c1_i64, %c64_i64 : i64
    return %0 : i64
  }
  func.func @foldShru() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c2_i64 = arith.constant 2 : i64
    %0 = arith.shrui %c8_i64, %c2_i64 : i64
    return %0 : i64
  }
  func.func @foldShru2() -> i64 {
    %c-2_i64 = arith.constant -2 : i64
    %c1_i64 = arith.constant 1 : i64
    %0 = arith.shrui %c-2_i64, %c1_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShru() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c132_i64 = arith.constant 132 : i64
    %0 = arith.shrui %c8_i64, %c132_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShru2() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c-32_i64 = arith.constant -32 : i64
    %0 = arith.shrui %c8_i64, %c-32_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShru3() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c64_i64 = arith.constant 64 : i64
    %0 = arith.shrui %c8_i64, %c64_i64 : i64
    return %0 : i64
  }
  func.func @foldShrs() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c2_i64 = arith.constant 2 : i64
    %0 = arith.shrsi %c8_i64, %c2_i64 : i64
    return %0 : i64
  }
  func.func @foldShrs2() -> i64 {
    %c-2_i64 = arith.constant -2 : i64
    %c1_i64 = arith.constant 1 : i64
    %0 = arith.shrsi %c-2_i64, %c1_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShrs() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c132_i64 = arith.constant 132 : i64
    %0 = arith.shrsi %c8_i64, %c132_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShrs2() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c-32_i64 = arith.constant -32 : i64
    %0 = arith.shrsi %c8_i64, %c-32_i64 : i64
    return %0 : i64
  }
  func.func @nofoldShrs3() -> i64 {
    %c8_i64 = arith.constant 8 : i64
    %c64_i64 = arith.constant 64 : i64
    %0 = arith.shrsi %c8_i64, %c64_i64 : i64
    return %0 : i64
  }
  func.func @test_negf() -> f32 {
    %cst = arith.constant 2.000000e+00 : f32
    %0 = arith.negf %cst : f32
    return %0 : f32
  }
  func.func @test_negf1(%arg0: f32) -> f32 {
    %0 = arith.negf %arg0 : f32
    %1 = arith.negf %0 : f32
    return %1 : f32
  }
  func.func @test_remui() -> vector<4xi32> {
    %cst = arith.constant dense<9> : vector<4xi32>
    %cst_0 = arith.constant dense<[1, 3, 5, 7]> : vector<4xi32>
    %0 = arith.remui %cst, %cst_0 : vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @test_remui_1(%arg0: vector<4xi32>) -> vector<4xi32> {
    %cst = arith.constant dense<1> : vector<4xi32>
    %0 = arith.remui %arg0, %cst : vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @test_remsi() -> vector<4xi32> {
    %cst = arith.constant dense<9> : vector<4xi32>
    %cst_0 = arith.constant dense<[1, 3, 5, 7]> : vector<4xi32>
    %0 = arith.remsi %cst, %cst_0 : vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @test_remsi_1(%arg0: vector<4xi32>) -> vector<4xi32> {
    %cst = arith.constant dense<1> : vector<4xi32>
    %0 = arith.remsi %arg0, %cst : vector<4xi32>
    return %0 : vector<4xi32>
  }
  func.func @test_remf() -> f32 {
    %cst = arith.constant 3.000000e+00 : f32
    %cst_0 = arith.constant 2.000000e+00 : f32
    %0 = arith.remf %cst, %cst_0 : f32
    return %0 : f32
  }
  func.func @test_remf2() -> (f32, f32) {
    %cst = arith.constant 3.000000e+00 : f32
    %cst_0 = arith.constant -2.000000e+00 : f32
    %cst_1 = arith.constant -3.000000e+00 : f32
    %0 = arith.remf %cst, %cst_0 : f32
    %1 = arith.remf %cst_1, %cst_0 : f32
    return %0, %1 : f32, f32
  }
  func.func @test_remf_vec() -> vector<4xf32> {
    %cst = arith.constant dense<[1.000000e+00, 2.000000e+00, -3.000000e+00, 4.000000e+00]> : vector<4xf32>
    %cst_0 = arith.constant dense<2.000000e+00> : vector<4xf32>
    %0 = arith.remf %cst, %cst_0 : vector<4xf32>
    return %0 : vector<4xf32>
  }
  func.func @test_andi_not_fold_rhs(%arg0: index) -> index {
    %c-1 = arith.constant -1 : index
    %0 = arith.xori %arg0, %c-1 : index
    %1 = arith.andi %arg0, %0 : index
    return %1 : index
  }
  func.func @test_andi_not_fold_lhs(%arg0: index) -> index {
    %c-1 = arith.constant -1 : index
    %0 = arith.xori %arg0, %c-1 : index
    %1 = arith.andi %0, %arg0 : index
    return %1 : index
  }
  func.func @test_andi_not_fold_rhs_vec(%arg0: vector<2xi32>) -> vector<2xi32> {
    %cst = arith.constant dense<-1> : vector<2xi32>
    %0 = arith.xori %arg0, %cst : vector<2xi32>
    %1 = arith.andi %arg0, %0 : vector<2xi32>
    return %1 : vector<2xi32>
  }
  func.func @test_andi_not_fold_lhs_vec(%arg0: vector<2xi32>) -> vector<2xi32> {
    %cst = arith.constant dense<-1> : vector<2xi32>
    %0 = arith.xori %arg0, %cst : vector<2xi32>
    %1 = arith.andi %0, %arg0 : vector<2xi32>
    return %1 : vector<2xi32>
  }
  func.func @xorxor0(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.xori %arg0, %arg1 : i32
    %1 = arith.xori %0, %arg1 : i32
    return %1 : i32
  }
  func.func @xorxor1(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.xori %arg1, %arg0 : i32
    %1 = arith.xori %0, %arg1 : i32
    return %1 : i32
  }
  func.func @xorxor2(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.xori %arg0, %arg1 : i32
    %1 = arith.xori %arg1, %0 : i32
    return %1 : i32
  }
  func.func @xorxor3(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.xori %arg1, %arg0 : i32
    %1 = arith.xori %arg1, %0 : i32
    return %1 : i32
  }
  func.func @andand0(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.andi %arg0, %arg1 : i32
    %1 = arith.andi %arg0, %0 : i32
    return %1 : i32
  }
  func.func @andand1(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.andi %arg0, %arg1 : i32
    %1 = arith.andi %0, %arg0 : i32
    return %1 : i32
  }
  func.func @andand2(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.andi %arg0, %arg1 : i32
    %1 = arith.andi %arg1, %0 : i32
    return %1 : i32
  }
  func.func @andand3(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.andi %arg0, %arg1 : i32
    %1 = arith.andi %0, %arg1 : i32
    return %1 : i32
  }
  func.func @truncIShrSIToTrunciShrUI(%arg0: i64) -> i32 {
    %c32_i64 = arith.constant 32 : i64
    %0 = arith.shrsi %arg0, %c32_i64 : i64
    %1 = arith.trunci %0 : i64 to i32
    return %1 : i32
  }
  func.func @truncIShrSIToTrunciShrUIBadShiftAmt1(%arg0: i64) -> i32 {
    %c33_i64 = arith.constant 33 : i64
    %0 = arith.shrsi %arg0, %c33_i64 : i64
    %1 = arith.trunci %0 : i64 to i32
    return %1 : i32
  }
  func.func @truncIShrSIToTrunciShrUIBadShiftAmt2(%arg0: i64) -> i32 {
    %c31_i64 = arith.constant 31 : i64
    %0 = arith.shrsi %arg0, %c31_i64 : i64
    %1 = arith.trunci %0 : i64 to i32
    return %1 : i32
  }
  func.func @wideMulToMulSIExtended(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.extsi %arg1 : i32 to i64
    %2 = arith.muli %0, %1 : i64
    %c32_i64 = arith.constant 32 : i64
    %3 = arith.shrui %2, %c32_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @wideMulToMulSIExtendedVector(%arg0: vector<3xi32>, %arg1: vector<3xi32>) -> vector<3xi32> {
    %0 = arith.extsi %arg0 : vector<3xi32> to vector<3xi64>
    %1 = arith.extsi %arg1 : vector<3xi32> to vector<3xi64>
    %2 = arith.muli %0, %1 : vector<3xi64>
    %cst = arith.constant dense<32> : vector<3xi64>
    %3 = arith.shrui %2, %cst : vector<3xi64>
    %4 = arith.trunci %3 : vector<3xi64> to vector<3xi32>
    return %4 : vector<3xi32>
  }
  func.func @wideMulToMulUIExtended(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.extui %arg0 : i32 to i64
    %1 = arith.extui %arg1 : i32 to i64
    %2 = arith.muli %0, %1 : i64
    %c32_i64 = arith.constant 32 : i64
    %3 = arith.shrui %2, %c32_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @wideMulToMulUIExtendedVector(%arg0: vector<3xi32>, %arg1: vector<3xi32>) -> vector<3xi32> {
    %0 = arith.extui %arg0 : vector<3xi32> to vector<3xi64>
    %1 = arith.extui %arg1 : vector<3xi32> to vector<3xi64>
    %2 = arith.muli %0, %1 : vector<3xi64>
    %cst = arith.constant dense<32> : vector<3xi64>
    %3 = arith.shrui %2, %cst : vector<3xi64>
    %4 = arith.trunci %3 : vector<3xi64> to vector<3xi32>
    return %4 : vector<3xi32>
  }
  func.func @wideMulToMulIExtendedMixedExt(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.extui %arg1 : i32 to i64
    %2 = arith.muli %0, %1 : i64
    %c32_i64 = arith.constant 32 : i64
    %3 = arith.shrui %2, %c32_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @wideMulToMulSIExtendedBadExt(%arg0: i16, %arg1: i16) -> i32 {
    %0 = arith.extsi %arg0 : i16 to i64
    %1 = arith.extsi %arg1 : i16 to i64
    %2 = arith.muli %0, %1 : i64
    %c32_i64 = arith.constant 32 : i64
    %3 = arith.shrui %2, %c32_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @wideMulToMulSIExtendedBadShift1(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.extsi %arg1 : i32 to i64
    %2 = arith.muli %0, %1 : i64
    %c33_i64 = arith.constant 33 : i64
    %3 = arith.shrui %2, %c33_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @wideMulToMulSIExtendedBadShift2(%arg0: i32, %arg1: i32) -> i32 {
    %0 = arith.extsi %arg0 : i32 to i64
    %1 = arith.extsi %arg1 : i32 to i64
    %2 = arith.muli %0, %1 : i64
    %c31_i64 = arith.constant 31 : i64
    %3 = arith.shrui %2, %c31_i64 : i64
    %4 = arith.trunci %3 : i64 to i32
    return %4 : i32
  }
  func.func @foldShli0(%arg0: i64) -> i64 {
    %c0_i64 = arith.constant 0 : i64
    %0 = arith.shli %arg0, %c0_i64 : i64
    return %0 : i64
  }
  func.func @foldShrui0(%arg0: i64) -> i64 {
    %c0_i64 = arith.constant 0 : i64
    %0 = arith.shrui %arg0, %c0_i64 : i64
    return %0 : i64
  }
  func.func @foldShrsi0(%arg0: i64) -> i64 {
    %c0_i64 = arith.constant 0 : i64
    %0 = arith.shrsi %arg0, %c0_i64 : i64
    return %0 : i64
  }
  func.func @foldOrXor1(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.xori %arg0, %true : i1
    %1 = arith.ori %arg0, %0 : i1
    return %1 : i1
  }
  func.func @foldOrXor2(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.xori %true, %arg0 : i1
    %1 = arith.ori %arg0, %0 : i1
    return %1 : i1
  }
  func.func @foldOrXor3(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.xori %arg0, %true : i1
    %1 = arith.ori %0, %arg0 : i1
    return %1 : i1
  }
  func.func @foldOrXor4(%arg0: i1) -> i1 {
    %true = arith.constant true
    %0 = arith.xori %true, %arg0 : i1
    %1 = arith.ori %0, %arg0 : i1
    return %1 : i1
  }
  func.func @foldOrXor5(%arg0: i32) -> i32 {
    %c-1_i32 = arith.constant -1 : i32
    %0 = arith.xori %arg0, %c-1_i32 : i32
    %1 = arith.ori %arg0, %0 : i32
    return %1 : i32
  }
  func.func @foldOrXor6(%arg0: index) -> index {
    %c-1 = arith.constant -1 : index
    %0 = arith.xori %arg0, %c-1 : index
    %1 = arith.ori %arg0, %0 : index
    return %1 : index
  }
  func.func @selectOfPoison(%arg0: i1, %arg1: i32) -> (i32, i32, i32, i32) {
    %0 = ub.poison : i32
    %1 = arith.select %arg0, %0, %arg1 : i32
    %2 = arith.select %arg0, %arg1, %0 : i32
    %true = arith.constant true
    %false = arith.constant false
    %3 = arith.select %true, %0, %arg1 : i32
    %4 = arith.select %false, %0, %arg1 : i32
    return %1, %2, %3, %4 : i32, i32, i32, i32
  }
  func.func @addi_poison1(%arg0: i32) -> i32 {
    %0 = ub.poison : i32
    %1 = arith.addi %0, %arg0 : i32
    return %1 : i32
  }
  func.func @addi_poison2(%arg0: i32) -> i32 {
    %0 = ub.poison : i32
    %1 = arith.addi %arg0, %0 : i32
    return %1 : i32
  }
  func.func @addf_poison1(%arg0: f32) -> f32 {
    %0 = ub.poison : f32
    %1 = arith.addf %0, %arg0 : f32
    return %1 : f32
  }
  func.func @addf_poison2(%arg0: f32) -> f32 {
    %0 = ub.poison : f32
    %1 = arith.addf %arg0, %0 : f32
    return %1 : f32
  }
  func.func @negf_poison() -> f32 {
    %0 = ub.poison : f32
    %1 = arith.negf %0 : f32
    return %1 : f32
  }
  func.func @extsi_poison() -> i64 {
    %0 = ub.poison : i32
    %1 = arith.extsi %0 : i32 to i64
    return %1 : i64
  }
  func.func @unsignedExtendConstantResource() -> tensor<i16> {
    %cst = arith.constant dense_resource<blob1> : tensor<i8>
    %0 = arith.extui %cst : tensor<i8> to tensor<i16>
    return %0 : tensor<i16>
  }
  func.func @extsi_i0() -> i16 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.extsi %c0_i0 : i0 to i16
    return %0 : i16
  }
  func.func @extui_i0() -> i16 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.extui %c0_i0 : i0 to i16
    return %0 : i16
  }
  func.func @trunc_i0() -> i0 {
    %c-1_i8 = arith.constant -1 : i8
    %0 = arith.trunci %c-1_i8 : i8 to i0
    return %0 : i0
  }
  func.func @shli_i0() -> i0 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.shli %c0_i0, %c0_i0 : i0
    return %0 : i0
  }
  func.func @shrsi_i0() -> i0 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.shrsi %c0_i0, %c0_i0 : i0
    return %0 : i0
  }
  func.func @shrui_i0() -> i0 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.shrui %c0_i0, %c0_i0 : i0
    return %0 : i0
  }
  func.func @maxsi_i0() -> i0 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.maxsi %c0_i0, %c0_i0 : i0
    return %0 : i0
  }
  func.func @minsi_i0() -> i0 {
    %c0_i0 = arith.constant 0 : i0
    %0 = arith.minsi %c0_i0, %c0_i0 : i0
    return %0 : i0
  }
  func.func @mulsi_extended_i0() -> (i0, i0) {
    %c0_i0 = arith.constant 0 : i0
    %low, %high = arith.mulsi_extended %c0_i0, %c0_i0 : i0
    return %low, %high : i0, i0
  }
  func.func @sequences_fastmath_contract(%arg0: bf16) -> bf16 {
    %0 = arith.extf %arg0 fastmath<contract> : bf16 to f32
    %1 = math.absf %0 : f32
    %2 = arith.truncf %1 fastmath<contract> : f32 to bf16
    %3 = arith.extf %2 fastmath<contract> : bf16 to f32
    %4 = math.sin %3 : f32
    %5 = arith.truncf %4 fastmath<contract> : f32 to bf16
    return %5 : bf16
  }
  func.func @sequences_no_fastmath(%arg0: bf16) -> bf16 {
    %0 = arith.extf %arg0 : bf16 to f32
    %1 = math.absf %0 : f32
    %2 = arith.truncf %1 : f32 to bf16
    %3 = arith.extf %2 : bf16 to f32
    %4 = math.sin %3 : f32
    %5 = arith.truncf %4 : f32 to bf16
    return %5 : bf16
  }
  func.func @eliminate_cast_to_f16(%arg0: f32) -> f32 {
    %0 = arith.truncf %arg0 fastmath<contract> : f32 to f16
    %1 = arith.extf %0 fastmath<contract> : f16 to f32
    return %1 : f32
  }
  func.func @eliminate_cast_to_bf16(%arg0: f32) -> f32 {
    %0 = arith.truncf %arg0 fastmath<contract> : f32 to bf16
    %1 = arith.extf %0 fastmath<contract> : bf16 to f32
    return %1 : f32
  }
  func.func @bf16_sin_vector(%arg0: vector<32x32x32xbf16>) -> vector<32x32x32xbf16> {
    %0 = arith.extf %arg0 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %1 = math.absf %0 : vector<32x32x32xf32>
    %2 = arith.truncf %1 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %3 = arith.extf %2 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %4 = math.sin %3 : vector<32x32x32xf32>
    %5 = arith.truncf %4 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    return %5 : vector<32x32x32xbf16>
  }
  func.func @f16_sin_vector(%arg0: vector<32x32x32xf16>) -> vector<32x32x32xf16> {
    %0 = arith.extf %arg0 fastmath<contract> : vector<32x32x32xf16> to vector<32x32x32xf32>
    %1 = math.absf %0 : vector<32x32x32xf32>
    %2 = arith.truncf %1 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xf16>
    %3 = arith.extf %2 fastmath<contract> : vector<32x32x32xf16> to vector<32x32x32xf32>
    %4 = math.sin %3 : vector<32x32x32xf32>
    %5 = arith.truncf %4 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xf16>
    return %5 : vector<32x32x32xf16>
  }
  func.func @bf16_branch_vector(%arg0: vector<32x32x32xbf16>) -> vector<32x32x32xbf16> {
    %0 = arith.extf %arg0 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %1 = math.absf %0 : vector<32x32x32xf32>
    %2 = arith.truncf %1 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %3 = arith.extf %2 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %4 = math.sin %3 : vector<32x32x32xf32>
    %5 = arith.truncf %4 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %6 = arith.extf %5 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %7 = math.cos %3 : vector<32x32x32xf32>
    %8 = arith.truncf %7 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %9 = arith.extf %8 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %10 = arith.addf %6, %9 : vector<32x32x32xf32>
    %11 = arith.truncf %10 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    return %11 : vector<32x32x32xbf16>
  }
  func.func @bf16_fma(%arg0: vector<32x32x32xbf16>, %arg1: vector<32x32x32xbf16>, %arg2: vector<32x32x32xbf16>) -> vector<32x32x32xbf16> {
    %0 = arith.extf %arg0 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %1 = math.absf %0 : vector<32x32x32xf32>
    %2 = arith.truncf %1 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %3 = arith.extf %2 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %4 = math.sin %3 : vector<32x32x32xf32>
    %5 = arith.truncf %4 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    %6 = arith.extf %5 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %7 = math.fma %5, %arg1, %arg2 : vector<32x32x32xbf16>
    %8 = arith.extf %7 fastmath<contract> : vector<32x32x32xbf16> to vector<32x32x32xf32>
    %9 = arith.addf %8, %6 : vector<32x32x32xf32>
    %10 = arith.truncf %9 fastmath<contract> : vector<32x32x32xf32> to vector<32x32x32xbf16>
    return %10 : vector<32x32x32xbf16>
  }
}

{-#
  dialect_resources: {
    builtin: {
      blob1: "0x08000000010000000000000002000000000000000300000000000000"
    }
  }
#-}
