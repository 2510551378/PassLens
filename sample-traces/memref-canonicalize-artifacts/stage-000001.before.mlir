#map = affine_map<(d0, d1)[s0] -> (d0 + d1 * s0)>
module {
  func.func @collapse_shape_identity_fold(%arg0: memref<5xi8>) -> memref<5xi8> {
    return %arg0 : memref<5xi8>
  }
  func.func @expand_shape_identity_fold(%arg0: memref<5x4xi8>) -> memref<5x4xi8> {
    return %arg0 : memref<5x4xi8>
  }
  func.func @collapse_expand_rank0_cancel(%arg0: memref<1x1xi8>) -> memref<1x1xi8> {
    return %arg0 : memref<1x1xi8>
  }
  func.func @subview_of_size_memcast(%arg0: memref<4x6x16x32xi8>) -> memref<16x32xi8, strided<[32, 1], offset: 512>> {
    %subview = memref.subview %arg0[0, 1, 0, 0] [1, 1, 16, 32] [1, 1, 1, 1] : memref<4x6x16x32xi8> to memref<16x32xi8, strided<[32, 1], offset: 512>>
    return %subview : memref<16x32xi8, strided<[32, 1], offset: 512>>
  }
  func.func @subview_of_strides_memcast(%arg0: memref<1x1x?xf32, strided<[35, 7, 1], offset: ?>>) -> memref<1x4xf32, strided<[?, ?], offset: ?>> {
    %subview = memref.subview %arg0[0, 0, 0] [1, 1, 4] [1, 1, 1] : memref<1x1x?xf32, strided<[35, 7, 1], offset: ?>> to memref<1x4xf32, strided<[7, 1], offset: ?>>
    %cast = memref.cast %subview : memref<1x4xf32, strided<[7, 1], offset: ?>> to memref<1x4xf32, strided<[?, ?], offset: ?>>
    return %cast : memref<1x4xf32, strided<[?, ?], offset: ?>>
  }
  func.func @subview_of_static_full_size(%arg0: memref<4x6x16x32xi8>) -> memref<4x6x16x32xi8> {
    return %arg0 : memref<4x6x16x32xi8>
  }
  func.func @negative_subview_of_static_full_size(%arg0: memref<16x4xf32, strided<[4, 1], offset: ?>>, %arg1: index) -> memref<16x4xf32, strided<[4, 1], offset: ?>> {
    %subview = memref.subview %arg0[%arg1, 0] [16, 4] [1, 1] : memref<16x4xf32, strided<[4, 1], offset: ?>> to memref<16x4xf32, strided<[4, 1], offset: ?>>
    return %subview : memref<16x4xf32, strided<[4, 1], offset: ?>>
  }
  func.func @subview_canonicalize(%arg0: memref<?x?x?xf32>, %arg1: index, %arg2: index) -> memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, 1] [4, 1, %arg2] [1, 1, 1] : memref<?x?x?xf32> to memref<4x1x?xf32, strided<[?, ?, 1], offset: ?>>
    %cast = memref.cast %subview : memref<4x1x?xf32, strided<[?, ?, 1], offset: ?>> to memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>>
    return %cast : memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>>
  }
  func.func @rank_reducing_subview_canonicalize(%arg0: memref<?x?x?xf32>, %arg1: index, %arg2: index) -> memref<?x?xf32, strided<[?, ?], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, 1] [4, 1, %arg2] [1, 1, 1] : memref<?x?x?xf32> to memref<4x?xf32, strided<[?, 1], offset: ?>>
    %cast = memref.cast %subview : memref<4x?xf32, strided<[?, 1], offset: ?>> to memref<?x?xf32, strided<[?, ?], offset: ?>>
    return %cast : memref<?x?xf32, strided<[?, ?], offset: ?>>
  }
  func.func @multiple_reducing_dims(%arg0: memref<1x384x384xf32>, %arg1: index, %arg2: index, %arg3: index) -> memref<?xf32, strided<[1], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, %arg2] [1, 1, %arg3] [1, 1, 1] : memref<1x384x384xf32> to memref<1x?xf32, strided<[384, 1], offset: ?>>
    %subview_0 = memref.subview %subview[0, 0] [1, %arg3] [1, 1] : memref<1x?xf32, strided<[384, 1], offset: ?>> to memref<?xf32, strided<[1], offset: ?>>
    return %subview_0 : memref<?xf32, strided<[1], offset: ?>>
  }
  func.func @multiple_reducing_dims_dynamic(%arg0: memref<?x?x?xf32>, %arg1: index, %arg2: index, %arg3: index) -> memref<?xf32, strided<[1], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, %arg2] [1, 1, %arg3] [1, 1, 1] : memref<?x?x?xf32> to memref<1x?xf32, strided<[?, 1], offset: ?>>
    %subview_0 = memref.subview %subview[0, 0] [1, %arg3] [1, 1] : memref<1x?xf32, strided<[?, 1], offset: ?>> to memref<?xf32, strided<[1], offset: ?>>
    return %subview_0 : memref<?xf32, strided<[1], offset: ?>>
  }
  func.func @multiple_reducing_dims_all_dynamic(%arg0: memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>>, %arg1: index, %arg2: index, %arg3: index) -> memref<?xf32, strided<[?], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, %arg2] [1, 1, %arg3] [1, 1, 1] : memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>> to memref<1x?xf32, strided<[?, ?], offset: ?>>
    %subview_0 = memref.subview %subview[0, 0] [1, %arg3] [1, 1] : memref<1x?xf32, strided<[?, ?], offset: ?>> to memref<?xf32, strided<[?], offset: ?>>
    return %subview_0 : memref<?xf32, strided<[?], offset: ?>>
  }
  func.func @subview_negative_stride1(%arg0: memref<?xf32>) -> memref<?xf32, strided<[?], offset: ?>> {
    %c0 = arith.constant 0 : index
    %c-1 = arith.constant -1 : index
    %dim = memref.dim %arg0, %c0 : memref<?xf32>
    %0 = arith.addi %dim, %c-1 : index
    %subview = memref.subview %arg0[%0] [%dim] [-1] : memref<?xf32> to memref<?xf32, strided<[-1], offset: ?>>
    %cast = memref.cast %subview : memref<?xf32, strided<[-1], offset: ?>> to memref<?xf32, strided<[?], offset: ?>>
    return %cast : memref<?xf32, strided<[?], offset: ?>>
  }
  func.func @subview_negative_stride2(%arg0: memref<7xf32>) -> memref<?xf32, strided<[?], offset: ?>> {
    %subview = memref.subview %arg0[6] [7] [-1] : memref<7xf32> to memref<7xf32, strided<[-1], offset: 6>>
    %cast = memref.cast %subview : memref<7xf32, strided<[-1], offset: 6>> to memref<?xf32, strided<[?], offset: ?>>
    return %cast : memref<?xf32, strided<[?], offset: ?>>
  }
  func.func @dim_of_sized_view(%arg0: memref<?xi8>, %arg1: index) -> index {
    return %arg1 : index
  }
  func.func @no_fold_subview_negative_size(%arg0: memref<4x1024xf32>) -> memref<?x256xf32, strided<[1024, 1], offset: 2304>> {
    %c-13 = arith.constant -13 : index
    %subview = memref.subview %arg0[2, 256] [%c-13, 256] [1, 1] : memref<4x1024xf32> to memref<?x256xf32, strided<[1024, 1], offset: 2304>>
    return %subview : memref<?x256xf32, strided<[1024, 1], offset: 2304>>
  }
  func.func @no_fold_subview_zero_stride(%arg0: memref<10xf32>) -> memref<1xf32, strided<[?], offset: 1>> {
    %c0 = arith.constant 0 : index
    %subview = memref.subview %arg0[1] [1] [%c0] : memref<10xf32> to memref<1xf32, strided<[?], offset: 1>>
    return %subview : memref<1xf32, strided<[?], offset: 1>>
  }
  func.func @no_fold_of_store(%arg0: memref<32xi8>, %arg1: memref<memref<?xi8>>) {
    %cast = memref.cast %arg0 : memref<32xi8> to memref<?xi8>
    memref.store %cast, %arg1[] : memref<memref<?xi8>>
    return
  }
  func.func @dim_of_alloca(%arg0: index) -> index {
    return %arg0 : index
  }
  func.func @dim_of_alloca_with_dynamic_size(%arg0: memref<*xf32>) -> index {
    %0 = memref.rank %arg0 : memref<*xf32>
    return %0 : index
  }
  func.func @dim_of_memref_reshape(%arg0: memref<*xf32>, %arg1: memref<?xindex>) -> index {
    %c3 = arith.constant 3 : index
    %0 = memref.load %arg1[%c3] : memref<?xindex>
    memref.store %c3, %arg1[%c3] : memref<?xindex>
    return %0 : index
  }
  func.func @dim_of_memref_reshape_i32(%arg0: memref<*xf32>, %arg1: memref<?xi32>) -> index {
    %c3 = arith.constant 3 : index
    %0 = memref.load %arg1[%c3] : memref<?xi32>
    %1 = arith.index_cast %0 : i32 to index
    return %1 : index
  }
  func.func @dim_of_memref_reshape_block_arg_index(%arg0: memref<*xf32>, %arg1: memref<?xindex>, %arg2: index) -> index {
    %0 = memref.load %arg1[%arg2] : memref<?xindex>
    return %0 : index
  }
  func.func @dim_of_memref_reshape_for(%arg0: memref<*xf32>, %arg1: memref<?xindex>) -> index {
    %c0 = arith.constant 0 : index
    %c1 = arith.constant 1 : index
    %c4 = arith.constant 4 : index
    %reshape = memref.reshape %arg0(%arg1) : (memref<*xf32>, memref<?xindex>) -> memref<*xf32>
    %0 = scf.for %arg2 = %c0 to %c4 step %c1 iter_args(%arg3 = %c1) -> (index) {
      %dim = memref.dim %reshape, %arg2 : memref<*xf32>
      %1 = arith.muli %arg3, %dim : index
      scf.yield %1 : index
    }
    return %0 : index
  }
  func.func @dim_of_memref_reshape_undominated(%arg0: memref<*xf32>, %arg1: memref<?xindex>, %arg2: index) -> index {
    %c4 = arith.constant 4 : index
    %reshape = memref.reshape %arg0(%arg1) : (memref<*xf32>, memref<?xindex>) -> memref<*xf32>
    %0 = arith.muli %arg2, %c4 : index
    %dim = memref.dim %reshape, %0 : memref<*xf32>
    return %dim : index
  }
  func.func @alloc_const_fold() -> memref<?xf32> {
    %alloc = memref.alloc() : memref<4xf32>
    %cast = memref.cast %alloc : memref<4xf32> to memref<?xf32>
    return %cast : memref<?xf32>
  }
  func.func @alloc_alignment_const_fold() -> memref<?xf32> {
    %alloc = memref.alloc() {alignment = 4096 : i64} : memref<4xf32>
    %cast = memref.cast %alloc : memref<4xf32> to memref<?xf32>
    return %cast : memref<?xf32>
  }
  func.func @alloc_const_fold_with_symbols1(%arg0: index) -> memref<?xi32, strided<[?], offset: ?>> {
    %c1 = arith.constant 1 : index
    %alloc = memref.alloc(%arg0)[%c1, %c1] : memref<?xi32, strided<[?], offset: ?>>
    return %alloc : memref<?xi32, strided<[?], offset: ?>>
  }
  func.func @alloc_const_fold_with_symbols2() -> memref<?xi32, strided<[?], offset: ?>> {
    %c1 = arith.constant 1 : index
    %alloc = memref.alloc()[%c1, %c1] : memref<1xi32, strided<[?], offset: ?>>
    %cast = memref.cast %alloc : memref<1xi32, strided<[?], offset: ?>> to memref<?xi32, strided<[?], offset: ?>>
    return %cast : memref<?xi32, strided<[?], offset: ?>>
  }
  func.func @allocator(%arg0: memref<memref<?xi32>>, %arg1: index) {
    %alloc = memref.alloc(%arg1) : memref<?xi32>
    memref.store %alloc, %arg0[] : memref<memref<?xi32>>
    return
  }
  func.func @compose_collapse_of_collapse_zero_dim(%arg0: memref<1x1x1xf32>) -> memref<f32> {
    %collapse_shape = memref.collapse_shape %arg0 [] : memref<1x1x1xf32> into memref<f32>
    return %collapse_shape : memref<f32>
  }
  func.func @compose_collapse_of_collapse(%arg0: memref<?x?x?x?x?xf32>) -> memref<?x?xf32> {
    %collapse_shape = memref.collapse_shape %arg0 [[0, 1, 2], [3, 4]] : memref<?x?x?x?x?xf32> into memref<?x?xf32>
    return %collapse_shape : memref<?x?xf32>
  }
  func.func @do_not_compose_collapse_of_expand_non_identity_layout(%arg0: memref<?x?xf32, strided<[?, 1]>>, %arg1: index, %arg2: index) -> memref<?xf32, strided<[?]>> {
    %expand_shape = memref.expand_shape %arg0 [[0, 1], [2]] output_shape [%arg1, 4, %arg2] : memref<?x?xf32, strided<[?, 1]>> into memref<?x4x?xf32, strided<[?, ?, 1]>>
    %collapse_shape = memref.collapse_shape %expand_shape [[0, 1, 2]] : memref<?x4x?xf32, strided<[?, ?, 1]>> into memref<?xf32, strided<[?]>>
    return %collapse_shape : memref<?xf32, strided<[?]>>
  }
  func.func @compose_expand_of_expand(%arg0: memref<?x?xf32>, %arg1: index, %arg2: index, %arg3: index, %arg4: index) -> memref<?x6x4x5x?xf32> {
    %expand_shape = memref.expand_shape %arg0 [[0, 1, 2], [3, 4]] output_shape [%arg3, 6, 4, 5, %arg4] : memref<?x?xf32> into memref<?x6x4x5x?xf32>
    return %expand_shape : memref<?x6x4x5x?xf32>
  }
  func.func @compose_expand_of_expand_of_zero_dim(%arg0: memref<f32>) -> memref<1x1x1xf32> {
    %expand_shape = memref.expand_shape %arg0 [] output_shape [1, 1, 1] : memref<f32> into memref<1x1x1xf32>
    return %expand_shape : memref<1x1x1xf32>
  }
  func.func @fold_collapse_of_expand(%arg0: memref<12x4xf32>) -> memref<12x4xf32> {
    return %arg0 : memref<12x4xf32>
  }
  func.func @fold_collapse_collapse_of_expand(%arg0: memref<?x?xf32>, %arg1: index, %arg2: index) -> memref<?x?xf32> {
    return %arg0 : memref<?x?xf32>
  }
  func.func @fold_memref_expand_cast(%arg0: memref<?x?xf32>) -> memref<2x4x4xf32> {
    %cast = memref.cast %arg0 : memref<?x?xf32> to memref<8x4xf32>
    %expand_shape = memref.expand_shape %cast [[0, 1], [2]] output_shape [2, 4, 4] : memref<8x4xf32> into memref<2x4x4xf32>
    return %expand_shape : memref<2x4x4xf32>
  }
  func.func @collapse_after_memref_cast_type_change(%arg0: memref<?x512x1x1xf32>) -> memref<?x?xf32> {
    %collapse_shape = memref.collapse_shape %arg0 [[0], [1, 2, 3]] : memref<?x512x1x1xf32> into memref<?x512xf32>
    %cast = memref.cast %collapse_shape : memref<?x512xf32> to memref<?x?xf32>
    return %cast : memref<?x?xf32>
  }
  func.func @collapse_after_memref_cast(%arg0: memref<?x512x1x?xf32>) -> memref<?x?xf32> {
    %collapse_shape = memref.collapse_shape %arg0 [[0], [1, 2, 3]] : memref<?x512x1x?xf32> into memref<?x?xf32>
    return %collapse_shape : memref<?x?xf32>
  }
  func.func @collapse_after_memref_cast_type_change_dynamic(%arg0: memref<1x1x1x?xi64>) -> memref<?x?xi64> {
    %collapse_shape = memref.collapse_shape %arg0 [[0, 1, 2], [3]] : memref<1x1x1x?xi64> into memref<1x?xi64>
    %cast = memref.cast %collapse_shape : memref<1x?xi64> to memref<?x?xi64>
    return %cast : memref<?x?xi64>
  }
  func.func @reduced_memref(%arg0: memref<2x5x7x1xf32>, %arg1: index) -> memref<1x4x1xf32, strided<[35, 7, 1], offset: ?>> {
    %subview = memref.subview %arg0[%arg1, %arg1, %arg1, 0] [1, 4, 1, 1] [1, 1, 1, 1] : memref<2x5x7x1xf32> to memref<1x4x1xf32, strided<[35, 7, 1], offset: ?>>
    return %subview : memref<1x4x1xf32, strided<[35, 7, 1], offset: ?>>
  }
  func.func @fold_rank_memref(%arg0: memref<?x?xf32>) -> index {
    %c2 = arith.constant 2 : index
    return %c2 : index
  }
  func.func @fold_no_op_subview(%arg0: memref<20x42xf32>) -> memref<20x42xf32, strided<[42, 1]>> {
    %cast = memref.cast %arg0 : memref<20x42xf32> to memref<20x42xf32, strided<[42, 1]>>
    return %cast : memref<20x42xf32, strided<[42, 1]>>
  }
  func.func @no_fold_subview_with_non_zero_offset(%arg0: memref<20x42xf32>) -> memref<20x42xf32, strided<[42, 1], offset: 1>> {
    %subview = memref.subview %arg0[0, 1] [20, 42] [1, 1] : memref<20x42xf32> to memref<20x42xf32, strided<[42, 1], offset: 1>>
    return %subview : memref<20x42xf32, strided<[42, 1], offset: 1>>
  }
  func.func @no_fold_subview_with_non_unit_stride(%arg0: memref<20x42xf32>) -> memref<20x42xf32, strided<[42, 2]>> {
    %subview = memref.subview %arg0[0, 0] [20, 42] [1, 2] : memref<20x42xf32> to memref<20x42xf32, strided<[42, 2]>>
    return %subview : memref<20x42xf32, strided<[42, 2]>>
  }
  func.func @no_fold_dynamic_no_op_subview(%arg0: memref<?x?xf32>) -> memref<?x?xf32, strided<[?, 1]>> {
    %c0 = arith.constant 0 : index
    %c1 = arith.constant 1 : index
    %dim = memref.dim %arg0, %c0 : memref<?x?xf32>
    %dim_0 = memref.dim %arg0, %c1 : memref<?x?xf32>
    %subview = memref.subview %arg0[0, 0] [%dim, %dim_0] [1, 1] : memref<?x?xf32> to memref<?x?xf32, strided<[?, 1]>>
    return %subview : memref<?x?xf32, strided<[?, 1]>>
  }
  func.func @atomicrmw_cast_fold(%arg0: f32, %arg1: memref<4xf32>, %arg2: index) {
    %0 = memref.atomic_rmw addf %arg0, %arg1[%arg2] : (f32, memref<4xf32>) -> f32
    return
  }
  func.func @copy_of_cast(%arg0: memref<?xf32>, %arg1: memref<*xf32>) {
    %cast = memref.cast %arg1 : memref<*xf32> to memref<?xf32, strided<[?], offset: ?>>
    memref.copy %arg0, %cast : memref<?xf32> to memref<?xf32, strided<[?], offset: ?>>
    return
  }
  func.func @self_copy(%arg0: memref<?xf32>) {
    return
  }
  func.func @empty_copy(%arg0: memref<0x10xf32>, %arg1: memref<?x10xf32>) {
    return
  }
  func.func @scopeMerge() {
    %0 = "test.count"() : () -> index
    %alloca = memref.alloca(%0) : memref<?xi64>
    "test.use"(%alloca) : (memref<?xi64>) -> ()
    return
  }
  func.func @scopeMerge2() {
    "test.region"() ({
      memref.alloca_scope  {
        %0 = "test.count"() : () -> index
        %alloca = memref.alloca(%0) : memref<?xi64>
        "test.use"(%alloca) : (memref<?xi64>) -> ()
      }
      "test.terminator"() : () -> ()
    }) : () -> ()
    return
  }
  func.func @scopeMerge3() {
    %0 = "test.count"() : () -> index
    %alloca = memref.alloca(%0) : memref<?xi64>
    "test.region"() ({
      memref.alloca_scope  {
        "test.use"(%alloca) : (memref<?xi64>) -> ()
      }
      "test.terminator"() : () -> ()
    }) : () -> ()
    return
  }
  func.func @scopeMerge4() {
    %0 = "test.count"() : () -> index
    "test.region"() ({
      memref.alloca_scope  {
        %alloca = memref.alloca(%0) : memref<?xi64>
        "test.use"(%alloca) : (memref<?xi64>) -> ()
      }
      "test.op"() : () -> ()
      "test.terminator"() : () -> ()
    }) : () -> ()
    return
  }
  func.func @scopeMerge5() {
    "test.region"() ({
      affine.parallel (%arg0) = (0) to (64) {
        %alloca = memref.alloca(%arg0) : memref<?xi64>
        "test.use"(%alloca) : (memref<?xi64>) -> ()
      }
      "test.op"() : () -> ()
      "test.terminator"() : () -> ()
    }) : () -> ()
    return
  }
  func.func @scopeInline(%arg0: memref<index>) {
    %0 = "test.count"() : () -> index
    "test.region"() ({
      memref.store %0, %arg0[] : memref<index>
      "test.terminator"() : () -> ()
    }) : () -> ()
    return
  }
  func.func @reinterpret_noop(%arg0: memref<2x3x4xf32>) -> memref<2x3x4xf32> {
    return %arg0 : memref<2x3x4xf32>
  }
  func.func @reinterpret_of_reinterpret(%arg0: memref<?xi8>, %arg1: index, %arg2: index) -> memref<?xi8> {
    %reinterpret_cast = memref.reinterpret_cast %arg0 to offset: [0], sizes: [%arg2], strides: [1] : memref<?xi8> to memref<?xi8>
    return %reinterpret_cast : memref<?xi8>
  }
  func.func @reinterpret_of_cast(%arg0: memref<?xi8>, %arg1: index) -> memref<?xi8> {
    %reinterpret_cast = memref.reinterpret_cast %arg0 to offset: [0], sizes: [%arg1], strides: [1] : memref<?xi8> to memref<?xi8>
    return %reinterpret_cast : memref<?xi8>
  }
  func.func @reinterpret_of_subview(%arg0: memref<?xi8>, %arg1: index, %arg2: index) -> memref<?xi8> {
    %reinterpret_cast = memref.reinterpret_cast %arg0 to offset: [0], sizes: [%arg2], strides: [1] : memref<?xi8> to memref<?xi8>
    return %reinterpret_cast : memref<?xi8>
  }
  func.func @reinterpret_of_extract_strided_metadata_w_type_mistach(%arg0: memref<8x2xf32>) -> memref<?x?xf32, strided<[?, ?], offset: ?>> {
    %cast = memref.cast %arg0 : memref<8x2xf32> to memref<?x?xf32, strided<[?, ?], offset: ?>>
    return %cast : memref<?x?xf32, strided<[?, ?], offset: ?>>
  }
  func.func @reinterpret_of_extract_strided_metadata_w_constants(%arg0: memref<8x2xf32>) -> memref<?x?xf32, strided<[?, ?], offset: ?>> {
    %cast = memref.cast %arg0 : memref<8x2xf32> to memref<?x?xf32, strided<[?, ?], offset: ?>>
    return %cast : memref<?x?xf32, strided<[?, ?], offset: ?>>
  }
  func.func @reinterpret_of_extract_strided_metadata_same_type(%arg0: memref<?x?xf32, strided<[?, ?], offset: ?>>) -> memref<?x?xf32, strided<[?, ?], offset: ?>> {
    return %arg0 : memref<?x?xf32, strided<[?, ?], offset: ?>>
  }
  func.func @reinterpret_of_extract_strided_metadata_w_different_stride(%arg0: memref<8x2xf32>) -> memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>> {
    %c0 = arith.constant 0 : index
    %c1 = arith.constant 1 : index
    %base_buffer, %offset, %sizes:2, %strides:2 = memref.extract_strided_metadata %arg0 : memref<8x2xf32> -> memref<f32>, index, index, index, index, index
    %reinterpret_cast = memref.reinterpret_cast %base_buffer to offset: [%c0], sizes: [4, 2, 2], strides: [1, 1, %c1] : memref<f32> to memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>>
    return %reinterpret_cast : memref<?x?x?xf32, strided<[?, ?, ?], offset: ?>>
  }
  func.func @reinterpret_of_extract_strided_metadata_w_different_offset(%arg0: memref<8x2xf32>) -> memref<?x?xf32, strided<[?, ?], offset: ?>> {
    %c8 = arith.constant 8 : index
    %c2 = arith.constant 2 : index
    %c1 = arith.constant 1 : index
    %base_buffer, %offset, %sizes:2, %strides:2 = memref.extract_strided_metadata %arg0 : memref<8x2xf32> -> memref<f32>, index, index, index, index, index
    %reinterpret_cast = memref.reinterpret_cast %base_buffer to offset: [1], sizes: [%c8, %c2], strides: [%c2, %c1] : memref<f32> to memref<?x?xf32, strided<[?, ?], offset: ?>>
    return %reinterpret_cast : memref<?x?xf32, strided<[?, ?], offset: ?>>
  }
  func.func @canonicalize_rank_reduced_subview(%arg0: memref<8x?xf32>, %arg1: index) -> memref<?xf32, strided<[?], offset: ?>> {
    %subview = memref.subview %arg0[0, 0] [1, %arg1] [1, 1] : memref<8x?xf32> to memref<?xf32, strided<[1]>>
    %cast = memref.cast %subview : memref<?xf32, strided<[1]>> to memref<?xf32, strided<[?], offset: ?>>
    return %cast : memref<?xf32, strided<[?], offset: ?>>
  }
  func.func @memref_realloc_dead(%arg0: memref<2xf32>, %arg1: f32) -> memref<2xf32> {
    return %arg0 : memref<2xf32>
  }
  func.func @collapse_expand_fold_to_cast(%arg0: memref<?xf32, strided<[1]>, 3>, %arg1: index) -> memref<?xf32, 3> {
    %cast = memref.cast %arg0 : memref<?xf32, strided<[1]>, 3> to memref<?xf32, 3>
    return %cast : memref<?xf32, 3>
  }
  func.func @fold_trivial_subviews(%arg0: memref<?xf32, strided<[?], offset: ?>>, %arg1: index) -> memref<?xf32, strided<[?], offset: ?>> {
    %subview = memref.subview %arg0[5] [%arg1] [1] : memref<?xf32, strided<[?], offset: ?>> to memref<?xf32, strided<[?], offset: ?>>
    return %subview : memref<?xf32, strided<[?], offset: ?>>
  }
  func.func @load_store_nontemporal(%arg0: memref<32xf32>, %arg1: memref<32xf32>) {
    %c7 = arith.constant 7 : index
    %0 = memref.load %arg0[%c7] {nontemporal = true} : memref<32xf32>
    memref.store %0, %arg1[%c7] {nontemporal = true} : memref<32xf32>
    return
  }
  func.func @fold_trivial_memory_space_cast(%arg0: memref<?xf32>) -> memref<?xf32> {
    return %arg0 : memref<?xf32>
  }
  func.func @fold_multiple_memory_space_cast(%arg0: memref<?xf32>) -> memref<?xf32, 2> {
    %memspacecast = memref.memory_space_cast %arg0 : memref<?xf32> to memref<?xf32, 2>
    return %memspacecast : memref<?xf32, 2>
  }
  func.func private @ub_negative_alloc_size() -> memref<?x?x?xi1> {
    %c-2 = arith.constant -2 : index
    %alloc = memref.alloc(%c-2) : memref<15x?x1xi1>
    %cast = memref.cast %alloc : memref<15x?x1xi1> to memref<?x?x?xi1>
    return %cast : memref<?x?x?xi1>
  }
  func.func @subview_rank_reduction(%arg0: memref<1x384x384xf32>, %arg1: index) -> memref<?x?xf32, strided<[384, 1], offset: ?>> {
    %subview = memref.subview %arg0[0, %arg1, %arg1] [1, 1, %arg1] [1, 1, 1] : memref<1x384x384xf32> to memref<1x?xf32, strided<[384, 1], offset: ?>>
    %cast = memref.cast %subview : memref<1x?xf32, strided<[384, 1], offset: ?>> to memref<?x?xf32, strided<[384, 1], offset: ?>>
    return %cast : memref<?x?xf32, strided<[384, 1], offset: ?>>
  }
  func.func @fold_double_transpose(%arg0: memref<1x2x3x4x5xf32>) -> memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>> {
    %transpose = memref.transpose %arg0 (d0, d1, d2, d3, d4) -> (d4, d2, d1, d3, d0) : memref<1x2x3x4x5xf32> to memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>>
    return %transpose : memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>>
  }
  func.func @fold_double_transpose2(%arg0: memref<1x2x3x4x5xf32>) -> memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>> {
    %transpose = memref.transpose %arg0 (d0, d1, d2, d3, d4) -> (d4, d2, d1, d3, d0) : memref<1x2x3x4x5xf32> to memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>>
    return %transpose : memref<5x3x2x4x1xf32, strided<[1, 20, 60, 5, 120]>>
  }
  func.func @fold_identity_transpose(%arg0: memref<1x2x3x4x5xf32>) -> memref<1x2x3x4x5xf32> {
    return %arg0 : memref<1x2x3x4x5xf32>
  }
  func.func @cannot_fold_transpose_cast(%arg0: memref<?x4xf32>) -> memref<?x?xf32, #map> {
    %cast = memref.cast %arg0 : memref<?x4xf32> to memref<?x?xf32>
    %transpose = memref.transpose %cast (d0, d1) -> (d1, d0) : memref<?x?xf32> to memref<?x?xf32, #map>
    return %transpose : memref<?x?xf32, #map>
  }
}
