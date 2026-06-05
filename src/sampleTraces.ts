import type { TraceProvenanceKind } from './types';

export interface SampleTraceEntry {
  label: string;
  description: string;
  detail: string;
  file: string;
  provenanceKind: TraceProvenanceKind;
}

export function provenanceLabel(kind: TraceProvenanceKind): string {
  if (kind === 'live-pass-instrumentation') {
    return 'Live PassInstrumentation';
  }
  if (kind === 'converted-dump') {
    return 'Converted dump fallback';
  }
  if (kind === 'real-artifact-capture') {
    return 'Real artifact capture';
  }
  return 'Hand-authored schema example';
}

export const sampleTraces: SampleTraceEntry[] = [
  {
    label: 'Live MLIR PassInstrumentation',
    description: provenanceLabel('live-pass-instrumentation'),
    detail: 'Real L20 pass-lens-mlir-opt trace with artifact-backed IR for canonicalize,cse.',
    file: 'mlir-live-pass-instrumentation.json',
    provenanceKind: 'live-pass-instrumentation'
  },
  {
    label: 'Toy MLIR pipeline',
    description: provenanceLabel('hand-authored'),
    detail: 'Small trace for checking the basic viewer layout.',
    file: 'mlir-toy.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'Long lowering pipeline',
    description: provenanceLabel('hand-authored'),
    detail: 'Longer pipeline for scanning changed/unchanged passes and slow passes.',
    file: 'mlir-long-pipeline.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'Verifier failure',
    description: provenanceLabel('hand-authored'),
    detail: 'Trace with a verifier failure after a lowering pass.',
    file: 'mlir-verifier-failure.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'External IR artifacts',
    description: provenanceLabel('hand-authored'),
    detail: 'Trace that resolves before/after IR and diagnostics from artifact paths.',
    file: 'mlir-artifacts.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'Triton NPU UB budget overflow',
    description: provenanceLabel('hand-authored'),
    detail: 'Case study trace where scratch queue planning exceeds UB live-slot and queue-depth budgets.',
    file: 'triton-npu-ub-budget-overflow.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'Triton NPU strict fallback',
    description: provenanceLabel('hand-authored'),
    detail: 'Case study trace where a lowering pass introduces fallback and missing tile proof evidence.',
    file: 'triton-npu-strict-fallback.json',
    provenanceKind: 'hand-authored'
  },
  {
    label: 'Real Triton NPU dual RMSNorm',
    description: provenanceLabel('real-artifact-capture'),
    detail: 'Real local npuir2ascendc sample generated from fused_dual_residual_rmsnorm_kernel.',
    file: 'real-triton-npu-dual-rmsnorm.json',
    provenanceKind: 'real-artifact-capture'
  }
];
