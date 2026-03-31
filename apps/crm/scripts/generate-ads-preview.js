#!/usr/bin/env node
/**
 * 广告文案生成预览 — 不需要数据库连接，不需要 Google Ads API
 * 用法：cd apps/crm && node scripts/generate-ads-preview.js
 */

require('../lib/load-env');
const { generateAdVariants, generateLandingPageVariants } = require('../services/adGenerationEngine');

const BUSINESS_CONFIGS = [
  {
    label: '🏠 房主能源顾问（homeowner energy advisory）',
    input: { channel: 'google', product_focus: 'energy_advisory', audience_segment: 'homeowner' },
  },
  {
    label: '🏢 投资房东合规检查（landlord compliance）',
    input: { channel: 'google', product_focus: 'electrical_inspection', audience_segment: 'landlord' },
  },
  {
    label: '🔍 独立能源风险报告（risk report）',
    input: { channel: 'google', product_focus: 'essential_report', audience_segment: 'homeowner' },
  },
];

function printDivider(label) {
  console.log('\n' + '═'.repeat(60));
  console.log(label);
  console.log('═'.repeat(60));
}

function printAd(variant, i) {
  console.log(`\n  --- Variant ${variant.variant_label || i + 1} ---`);
  console.log(`  标题 Headline:  ${variant.headline}`);
  console.log(`  正文 Body:      ${variant.body_text}`);
  console.log(`  按钮 CTA:       ${variant.call_to_action}`);
}

function printLanding(variant) {
  console.log(`\n  --- Variant ${variant.variant_label} ---`);
  console.log(`  主标题:   ${variant.headline}`);
  console.log(`  副标题:   ${variant.subheadline}`);
  console.log(`  按钮:     ${variant.cta_text}`);
  console.log(`  定位角度: ${variant.supporting_angle}`);
}

async function main() {
  const hasKey = !!process.env.OPENAI_API_KEY;
  console.log(`\n[广告生成] 使用方式：${hasKey ? '✅ OpenAI AI 生成' : '⚠️  模板兜底（未设置 OPENAI_API_KEY）'}`);

  for (const config of BUSINESS_CONFIGS) {
    printDivider(config.label);

    try {
      // 广告文案
      console.log('\n📢 Google Ads 搜索广告文案（RSA）：');
      const adResult = await generateAdVariants(config.input);
      if (adResult?.variants?.length) {
        adResult.variants.forEach(printAd);
      } else {
        console.log('  ⚠️  生成失败，请检查 OPENAI_API_KEY');
      }

      // Landing page 文案
      console.log('\n🖥️  Landing Page 文案：');
      const landingResult = await generateLandingPageVariants({ ...config.input, page_key: 'energy_landing' });
      if (landingResult?.variants?.length) {
        landingResult.variants.forEach(printLanding);
      }
    } catch (err) {
      console.error(`  ❌ 错误: ${err.message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ 生成完成');
  console.log('下一步：把上面的文案粘贴到 Google Ads 广告组里');
  console.log('═'.repeat(60) + '\n');
}

main().catch((e) => {
  console.error('[generate-ads-preview] 失败:', e.message || e);
  process.exit(1);
});
