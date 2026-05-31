import { PageFrame } from '@/components/layout/PageFrame';
import { ComingSoon } from '@/components/shared/ComingSoon';

export function AccountsPage() {
  return (
    <PageFrame section="accounts">
      <ComingSoon
        summary="统一身份：一张账号表 + 角色字段，一个登录入口。本页管理管理员 / 老师 / 家长三类账号与角色。"
        points={[
          '角色三种：管理员 admin、老师 teacher、家长 parent（业务逻辑 §2.1）',
          '老师账号关联老师档案，家长账号按手机号关联联系人（业务逻辑 §2.2）',
          '开通账号、重置默认密码、强制首登改密（业务逻辑 §3.3）',
        ]}
        deliveredBy="后端已收口为 accounts(role) 统一身份；本页后续补账号开通、关联档案、重置默认密码等管理操作。"
      />
    </PageFrame>
  );
}
