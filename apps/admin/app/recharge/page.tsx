import landingStyles from "../landing/page.module.css"
import styles from "./page.module.css"

const PRICE_ITEMS = [
  {
    name: "紧急单次申诉包",
    credits: "100 点",
    price: "$49 / ¥350",
    note: "适合紧急账号恢复与单次补件申诉"
  },
  {
    name: "季度无限护航包",
    credits: "2000 点",
    price: "$299 / ¥2100",
    note: "适合团队化高频申诉、周更策略护航"
  }
]

function envOrFallback(value: string | undefined, fallback: string) {
  const normalized = value?.trim()
  if (!normalized || normalized.includes("<")) {
    return fallback
  }
  return normalized
}

const SUPPORT_EMAIL = envOrFallback(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, "support@formpilot.ai")
const SUPPORT_WECHAT = envOrFallback(process.env.NEXT_PUBLIC_SUPPORT_WECHAT, "formpilot_support")
const ALIPAY_ACCOUNT = envOrFallback(process.env.NEXT_PUBLIC_ALIPAY_ACCOUNT, "pay@formpilot.ai")
const WECHAT_QR_SRC = envOrFallback(process.env.NEXT_PUBLIC_WECHAT_QR_SRC, "/recharge/wechat-qr-placeholder.svg")
const ALIPAY_QR_SRC = envOrFallback(process.env.NEXT_PUBLIC_ALIPAY_QR_SRC, "/recharge/alipay-qr-placeholder.svg")

export default function RechargePage() {
  return (
    <main className={landingStyles.page}>
      <div className={landingStyles.noiseLayer} />
      <section className={`${landingStyles.shell} ${styles.shell}`}>
        <header className={`${landingStyles.hero} ${styles.hero}`}>
          <h1 className={styles.title}>
            获取 FormPilot 授权码
          </h1>
          <p className={styles.subtitle}>
            购买体验点数后，您将获得专属邀请码。在插件面板输入邀请码即可兑换额度并解锁完整的高频申诉能力。
          </p>
        </header>

        <section className={`${landingStyles.pricingSection} ${styles.pricingSection}`}>
          <div className={`${landingStyles.pricingGrid} ${styles.pricingGrid}`}>
            {PRICE_ITEMS.map((item) => (
              <article key={item.name} className={`${landingStyles.priceCard} ${styles.priceCard}`}>
                <h3 className={styles.priceTitle}>{item.name}</h3>
                <div className={`${landingStyles.credits} ${styles.credits}`}>{item.credits}</div>
                <div className={`${landingStyles.price} ${styles.price}`}>{item.price}</div>
                <p className={styles.priceNote}>{item.note}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${landingStyles.hero} ${styles.purchaseSection}`}>
          <h2 className={styles.sectionTitle}>如何购买与充值？</h2>
          <div className={styles.purchasePanel}>
            <p className={styles.lead}>
              请添加下方客服微信/支付宝或发送邮件，备注 <strong>购买体验包</strong>。支付完成后，客服将向您发送包含点数的专属充值码。
            </p>
            <div className={styles.paymentGrid}>
              <div className={styles.paymentCard}>
                <div className={styles.qrFrame}>
                  <img src={WECHAT_QR_SRC} alt="WeChat payment QR" className={styles.qrImage} />
                </div>
                <span className={styles.paymentLabel}>客服微信</span>
                <span className={styles.paymentMeta}>WeChat: {SUPPORT_WECHAT}</span>
              </div>
              <div className={styles.paymentCard}>
                <div className={styles.qrFrame}>
                  <img src={ALIPAY_QR_SRC} alt="Alipay payment QR" className={styles.qrImage} />
                </div>
                <span className={styles.paymentLabel}>支付宝</span>
                <span className={styles.paymentMeta}>Alipay: {ALIPAY_ACCOUNT}</span>
              </div>
            </div>
            <div className={styles.contactLine}>
              海外支付或开票需求，请联系：
              <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.contactLink}>
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </section>
      </section>
    </main>
  )
}
