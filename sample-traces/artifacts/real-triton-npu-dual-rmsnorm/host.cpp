#include <cstdint>

extern "C" void fused_dual_residual_rmsnorm_kernel_rmsnorm_residual_cast(void* arg0, void* arg1, void* arg2, void* arg3, void* arg4, void* arg5, void* arg6);

int LaunchFusedDualResidualRmsnormKernelRmsnormResidualCast(void* arg0, void* arg1, void* arg2, void* arg3, void* arg4, void* arg5, void* arg6) {
    // TODO: bind stream and tiling before launch.
    fused_dual_residual_rmsnorm_kernel_rmsnorm_residual_cast(arg0, arg1, arg2, arg3, arg4, arg5, arg6);
    return 0;
}
