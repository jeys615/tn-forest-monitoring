import { selectBestHLSCandidate } from '../src/services/hls/HLSAcquisitionService.js';

const mockImages = [
  {
    id: 'NASA/HLS/HLSL30/v002/T43PFN_20260220T051124',
    properties: {
      'system:time_start': new Date('2026-02-20T05:11:24.000Z').getTime(),
      CLOUD_COVERAGE: 40,
    },
  },
  {
    id: 'NASA/HLS/HLSL30/v002/T43PFN_20260228T051115',
    properties: {
      'system:time_start': new Date('2026-02-28T05:11:15.000Z').getTime(),
      CLOUD_COVERAGE: 73,
    },
  },
  {
    id: 'NASA/HLS/HLSL30/v002/T43PFN_20260308T051121',
    properties: {
      'system:time_start': new Date('2026-03-08T05:11:21.000Z').getTime(),
      CLOUD_COVERAGE: 15,
    },
  },
];

const selected = selectBestHLSCandidate(mockImages as any, new Date('2026-03-01T00:00:00.000Z'));
console.log('Selected candidate:', selected?.id);
