#pragma once

#include <cstdint>

struct fused_dual_residual_rmsnorm_kernel_rmsnorm_residual_cast_tiling_data {
    uint32_t block_dim = 8;
    uint32_t tile_size = 128;
    uint32_t buffer_num = 1;
    uint32_t vector_width = 16;
};
