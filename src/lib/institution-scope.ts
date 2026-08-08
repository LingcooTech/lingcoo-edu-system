import type { Database } from '../db/client.js';
import * as accountsRepo from '../db/repositories/accounts.js';
import { httpError } from './http-error.js';

type RequestAccount = {
  id: string;
  role: string;
  roleAssignmentId?: string;
};

/** Returns null for a global administrator and an institution id for scoped staff. */
export async function resolveBackofficeInstitutionScope(
  db: Database,
  account?: RequestAccount,
): Promise<string | null> {
  if (account?.role === 'admin') return null;
  if (account?.role !== 'institution_admin' || !account.roleAssignmentId) {
    throw httpError(403, '权限不足');
  }

  const assignment = await accountsRepo.findRoleAssignmentById(db, account.roleAssignmentId);
  if (
    !assignment ||
    assignment.accountId !== account.id ||
    assignment.role !== 'institution_admin' ||
    assignment.status !== 'active' ||
    !assignment.institutionId
  ) {
    throw httpError(403, '机构负责人身份未绑定有效机构');
  }
  return assignment.institutionId;
}
