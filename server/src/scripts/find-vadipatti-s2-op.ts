import { GeeAuthService } from '../services/gee/GeeAuthService.js';
import { getGeeConfig } from '../config/gee.js';

async function findLatestOp() {
  const auth = GeeAuthService.getInstance();
  const config = getGeeConfig();
  const token = await auth.getAccessToken();

  const url = `https://earthengine.googleapis.com/v1alpha/projects/${config.projectId}/operations`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Goog-User-Project': config.projectId,
    },
  });

  if (!res.ok) {
    console.error('Failed to list operations:', await res.text());
    return;
  }

  const data = await res.json();
  const ops = data.operations || [];
  console.log(`Total operations: ${ops.length}`);

  const vadipattiS2Ops = ops.filter((op: any) =>
    op.metadata?.description?.includes('ZONE-260913-7787') &&
    op.metadata?.description?.includes('20260909')
  );

  console.log(`\nFound ${vadipattiS2Ops.length} operations for Vadipatti Sentinel-2 2026-09-09:`);
  for (const op of vadipattiS2Ops) {
    console.log(`\nName:        ${op.name}`);
    console.log(`Description: ${op.metadata?.description}`);
    console.log(`State:       ${op.metadata?.state}`);
    console.log(`Done:        ${op.done}`);
    console.log(`CreateTime:  ${op.metadata?.createTime}`);
    console.log(`EndTime:     ${op.metadata?.endTime}`);
  }
}

findLatestOp().catch(console.error);
