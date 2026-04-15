# 图标文件说明

本目录需要放置以下图标文件，用于应用界面：

## 必需文件列表

| 文件名 | 用途 | 建议尺寸 |
|--------|------|----------|
| favicon.png | 浏览器标签图标 | 32x32 或 64x64 |
| nav-dashboard.png | 仪表盘导航图标 | 24x24 |
| nav-record.png | 记录导航图标 | 24x24 |
| nav-list.png | 列表导航图标 | 24x24 |
| nav-analysis.png | 分析导航图标 | 24x24 |
| nav-report.png | 报告导航图标 | 24x24 |
| nav-curve.png | 曲线导航图标 | 24x24 |
| nav-settings.png | 设置导航图标 | 24x24 |

## 图标风格建议

- **主题**：小猫/猫咪相关图标
- **风格**：线性或填充风格，保持一致
- **颜色**：单色或浅色，适配深色主题
- **格式**：PNG 透明背景

## 获取图标

你可以从以下资源获取免费图标：

1. **Flaticon** (https://www.flaticon.com) - 搜索 "cat", "dashboard", "chart" 等
2. **Heroicons** (https://heroicons.com) - 可搜索猫咪相关 SVG
3. **Lucide** (https://lucide.dev) - 开源图标库
4. **自制**：使用 Figma 或 Sketch 设计

## 快速替代方案

如果没有准备图标，可以临时使用 Emoji 作为替代：

在浏览器控制台执行以下代码来临时替换图标：

```javascript
// 临时使用 Emoji 作为图标
const emojiIcons = {
    'nav-dashboard': '📊',
    'nav-record': '📝',
    'nav-list': '📋',
    'nav-analysis': '📈',
    'nav-report': '📑',
    'nav-curve': '📉',
    'nav-settings': '⚙️'
};

// 替换导航图标
document.querySelectorAll('.nav-icon').forEach((img, index) => {
    const key = Object.keys(emojiIcons)[index];
    if (key) {
        const span = document.createElement('span');
        span.textContent = emojiIcons[key];
        span.style.fontSize = '20px';
        img.parentNode.replaceChild(span, img);
    }
});
```

## 注意事项

- 所有图标文件必须是 PNG 格式
- 建议使用透明背景
- 图标尺寸一致会让界面更协调
- 可准备 2x 版本用于高分辨率屏幕
