-- Single-institution cleanup: the member_role enum backed the dropped
-- tenant_memberships table and is now unused. Drop the orphaned type.
DROP TYPE IF EXISTS "member_role";
