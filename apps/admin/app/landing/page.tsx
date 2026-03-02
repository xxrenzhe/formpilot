import styles from "./page.module.css"

const VALUE_ITEMS = [
  {
    title: "设备指纹防刷防关联",
    description: "每台设备仅首赠一次体验点数，降低薅羊毛与账号关联风险。"
  },
  {
    title: "端侧极密脱敏",
    description: "Tax ID、账单号、联系电话先在浏览器本地替换为占位符，再送入生成链路。"
  },
  {
    title: "动态 Prompt 炼丹炉",
    description: "插件采纳/拒绝仅作表层质量信号，核心权重默认由管理员人工调优。"
  }
]

const PRICE_ITEMS = [
  {
    name: "紧急单次申诉包",
    credits: "100 点",
    price: "$49",
    note: "适合紧急账号恢复与单次补件申诉"
  },
  {
    name: "季度无限护航包",
    credits: "2000 点",
    price: "$299",
    note: "适合团队化高频申诉、周更策略护航"
  }
]

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <div className={styles.noiseLayer} />
      <section className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>FORMPILOT ADS VERIFICATION & COMPLIANCE</span>
            <h1>
              拿下高难度企业认证与封号申诉
              <br />
              从“补材料”升级到“过风控”
            </h1>
            <p>
              100% 对齐 Google 审核风控语义，硬解长篇业务运营验证表单（Verify your business operations）。端侧极密脱敏，叠加高胜率 Prompt 引擎。目标不是“写得漂亮”，而是让账号直接恢复投放与获得高级权限。
            </p>
            <div className={styles.ctaRow}>
              <a href="/login" className={styles.primaryCta}>
                获取企业体验点数
              </a>
              <a href="/login" className={styles.secondaryCta}>
                联系客服购买授权码
              </a>
            </div>
          </div>
          <div className={styles.heroPanel}>
            <div className={styles.heroDemoVideo}>
              <span>[ 高难度表单秒级突破演示 GIF / Video ]</span>
            </div>
            <div className={styles.statGrid}>
              <article className={styles.statCard}>
                <div className={styles.statLabel}>可用模式</div>
                <div className={styles.statValue}>Ads 专项合规</div>
              </article>
              <article className={styles.statCard}>
                <div className={styles.statLabel}>计费方式</div>
                <div className={styles.statValue}>点数 + 充值码</div>
              </article>
              <article className={styles.statCard}>
                <div className={styles.statLabel}>模板调权</div>
                <div className={styles.statValue}>默认人工调权（可选自动微调）</div>
              </article>
              <article className={styles.statCard}>
                <div className={styles.statLabel}>交付目标</div>
                <div className={styles.statValue}>恢复投放速度优先</div>
              </article>
            </div>
          </div>
        </header>

        <section className={styles.featureSection}>
          {VALUE_ITEMS.map((item) => (
            <article key={item.title} className={styles.featureCard}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </section>

        <section className={styles.maskShowcase}>
          <div>
            <span className={styles.sectionKicker}>端侧脱敏流程</span>
            <h2>敏感信息不出浏览器原文</h2>
            <p>发送前完成占位符替换，云端仅接收结构化合规上下文，降低客户隐私泄露风险。</p>
          </div>
          <div className={styles.maskDemo}>
            <div className={styles.maskRow}>
              <span className={styles.maskLabel}>原始字段</span>
              <code>Tax ID: 98-1234567</code>
            </div>
            <div className={styles.arrow}>⇢</div>
            <div className={styles.maskRow}>
              <span className={styles.maskLabel}>发送内容</span>
              <code>Tax ID: [MASKED_01]</code>
            </div>
            <div className={styles.maskHint}>浏览器本地恢复真实文本后再展示给你</div>
          </div>
        </section>

        <section className={styles.pricingSection}>
          <div className={styles.pricingHeader}>
            <span className={styles.sectionKicker}>Pricing</span>
            <h2>高价值套餐</h2>
          </div>
          <div className={styles.pricingGrid}>
            {PRICE_ITEMS.map((item) => (
              <article key={item.name} className={styles.priceCard}>
                <h3>{item.name}</h3>
                <div className={styles.credits}>{item.credits}</div>
                <div className={styles.price}>{item.price}</div>
                <p>{item.note}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
