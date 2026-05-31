import { PageFrame } from '@/components/layout/PageFrame';
import { ComingSoon } from '@/components/shared/ComingSoon';

export function GuardiansPage() {
  return (
    <PageFrame section="guardians">
      <ComingSoon
        summary="家长既是 CRM 要联系的联系人（guardian），也是下单成交后自动创建的家长账号。本页集中管理家长档案与其名下孩子。"
        points={[
          '家长（联系人）档案：姓名、手机号；手机号是身份去重锚点，绝不重复建档（业务逻辑 §2.3）',
          '一个家长可绑定多个孩子，一个孩子可绑定多个家长（业务逻辑 §8）',
          '家长账号：下单成交后按手机号自动创建，默认密码 = 手机号后 6 位，强制首登改密（业务逻辑 §3.3）',
        ]}
        deliveredBy="等待后端家长列表 / 账号接口；账号部分由后续「统一身份」步骤交付。"
      />
    </PageFrame>
  );
}
