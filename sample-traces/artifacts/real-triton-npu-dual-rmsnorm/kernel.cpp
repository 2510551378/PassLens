#include "kernel_operator.h"

using namespace AscendC;

class FusedDualResidualRmsnormKernelRmsnormResidualCast {
public:
    static constexpr uint32_t kHiddenSize = 1024;
    static constexpr uint32_t kVectorWidth = 16;
    static constexpr float kEps = 1.0e-5f;
    static constexpr float kInvHiddenSize = 1.0f / 1024.0f;

    __aicore__ inline FusedDualResidualRmsnormKernelRmsnormResidualCast()
        : out_stage2_(), out_stage1_(), input_(), residual_(), weight0_(), weight1_() {}

    __aicore__ inline void Init(GM_ADDR arg0, GM_ADDR arg1, GM_ADDR arg2, GM_ADDR arg3, GM_ADDR arg4, GM_ADDR arg5, GM_ADDR arg6) {
        out_stage2_.SetGlobalBuffer((__gm__ half*)arg1);
        out_stage1_.SetGlobalBuffer((__gm__ half*)arg2);
        input_.SetGlobalBuffer((__gm__ half*)arg3);
        residual_.SetGlobalBuffer((__gm__ half*)arg4);
        weight0_.SetGlobalBuffer((__gm__ half*)arg5);
        weight1_.SetGlobalBuffer((__gm__ half*)arg6);
    }

    __aicore__ inline void Process() {
        if (block_idx != 0) {
            return;
        }

        float stage0_sum_sq = 0.0f;
        for (uint32_t base = 0; base < kHiddenSize; base += kVectorWidth) {
            const uint32_t lane_count = (base + kVectorWidth <= kHiddenSize) ? kVectorWidth : (kHiddenSize - base);
            float x_values[kVectorWidth];
            for (uint32_t lane = 0; lane < lane_count; ++lane) {
                const uint32_t index = base + lane;
                x_values[lane] = static_cast<float>(input_.GetValue(index));
            }
            for (uint32_t lane = 0; lane < lane_count; ++lane) {
                stage0_sum_sq += x_values[lane] * x_values[lane];
            }
        }
        const float rms0 = DeviceSqrt(stage0_sum_sq * kInvHiddenSize + kEps);

        float stage1_sum_sq = 0.0f;
        for (uint32_t base = 0; base < kHiddenSize; base += kVectorWidth) {
            const uint32_t lane_count = (base + kVectorWidth <= kHiddenSize) ? kVectorWidth : (kHiddenSize - base);
            float stage1_values[kVectorWidth];
            for (uint32_t lane = 0; lane < lane_count; ++lane) {
                const uint32_t index = base + lane;
                const float x = static_cast<float>(input_.GetValue(index));
                const float residual_value = static_cast<float>(residual_.GetValue(index));
                const float gamma0 = static_cast<float>(weight0_.GetValue(index));
                const float stage1 = residual_value + (x / rms0) * gamma0;
                stage1_values[lane] = stage1;
                out_stage1_.SetValue(index, static_cast<half>(stage1));
            }
            for (uint32_t lane = 0; lane < lane_count; ++lane) {
                stage1_sum_sq += stage1_values[lane] * stage1_values[lane];
            }
        }

        const float rms1 = DeviceSqrt(stage1_sum_sq * kInvHiddenSize + kEps);
        for (uint32_t base = 0; base < kHiddenSize; base += kVectorWidth) {
            const uint32_t lane_count = (base + kVectorWidth <= kHiddenSize) ? kVectorWidth : (kHiddenSize - base);
            for (uint32_t lane = 0; lane < lane_count; ++lane) {
                const uint32_t index = base + lane;
                const float stage1 = static_cast<float>(out_stage1_.GetValue(index));
                const float gamma1 = static_cast<float>(weight1_.GetValue(index));
                const float stage2 = (stage1 / rms1) * gamma1;
                out_stage2_.SetValue(index, static_cast<half>(stage2));
            }
        }
    }

private:
    __aicore__ inline float DeviceSqrt(float value) const {
        if (value <= 0.0f) {
            return 0.0f;
        }

        float estimate = value > 1.0f ? value : 1.0f;
        for (int iteration = 0; iteration < 6; ++iteration) {
            estimate = 0.5f * (estimate + value / estimate);
        }
        return estimate;
    }

    GlobalTensor<half> out_stage2_;
    GlobalTensor<half> out_stage1_;
    GlobalTensor<half> input_;
    GlobalTensor<half> residual_;
    GlobalTensor<half> weight0_;
    GlobalTensor<half> weight1_;
};

extern "C" __global__ __aicore__ void fused_dual_residual_rmsnorm_kernel_rmsnorm_residual_cast(GM_ADDR arg0, GM_ADDR arg1, GM_ADDR arg2, GM_ADDR arg3, GM_ADDR arg4, GM_ADDR arg5, GM_ADDR arg6) {
    FusedDualResidualRmsnormKernelRmsnormResidualCast kernel;
    kernel.Init(arg0, arg1, arg2, arg3, arg4, arg5, arg6);
    kernel.Process();
}
