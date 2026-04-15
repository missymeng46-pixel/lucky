# Lucky 交易复盘工具 - Supabase 配置指南

## 1. 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并注册/登录
2. 点击 "New Project" 创建新项目
3. 填写项目名称（如 "lucky-trading-journal"）
4. 选择地区和计划（免费版即可）
5. 等待项目创建完成

## 2. 获取 API 密钥

1. 进入项目后，点击左侧菜单 "Project Settings"
2. 选择 "API" 选项卡
3. 找到以下信息并记录：
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJ...`

4. 打开 `js/app.js` 文件，替换开头的配置：

```javascript
const SUPABASE_URL = 'https://你的项目ID.supabase.co';
const SUPABASE_ANON_KEY = '你的anon-key';
```

## 3. 创建数据库表

进入 "SQL Editor"，依次执行以下 SQL 语句：

### 3.1 users_profile 表

```sql
create table users_profile (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade,
    nickname text,
    initial_capital numeric default 100000,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id)
);

alter table users_profile enable row level security;

create policy "Users can view own profile"
    on users_profile for select
    using (auth.uid() = user_id);

create policy "Users can update own profile"
    on users_profile for update
    using (auth.uid() = user_id);

create policy "Users can insert own profile"
    on users_profile for insert
    with check (auth.uid() = user_id);
```

### 3.2 trades 表

```sql
create table trades (
    id text primary key,
    user_id uuid references auth.users(id) on delete cascade,
    date date not null,
    symbol text not null,
    direction text not null check (direction in ('long', 'short')),
    entry_price numeric not null,
    exit_price numeric not null,
    position_size numeric not null,
    pnl numeric not null,
    emotion jsonb,
    tags text[],
    checklist_completed boolean default false,
    notes text,
    screenshot_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table trades enable row level security;

create policy "Users can view own trades"
    on trades for select
    using (auth.uid() = user_id);

create policy "Users can insert own trades"
    on trades for insert
    with check (auth.uid() = user_id);

create policy "Users can update own trades"
    on trades for update
    using (auth.uid() = user_id);

create policy "Users can delete own trades"
    on trades for delete
    using (auth.uid() = user_id);
```

### 3.3 daily_checkin 表

```sql
create table daily_checkin (
    id text primary key,
    user_id uuid references auth.users(id) on delete cascade,
    date date not null,
    followed_plan boolean not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id, date)
);

alter table daily_checkin enable row level security;

create policy "Users can view own checkins"
    on daily_checkin for select
    using (auth.uid() = user_id);

create policy "Users can insert own checkins"
    on daily_checkin for insert
    with check (auth.uid() = user_id);

create policy "Users can update own checkins"
    on daily_checkin for update
    using (auth.uid() = user_id);
```

### 3.4 user_settings 表

```sql
create table user_settings (
    user_id uuid references auth.users(id) on delete cascade primary key,
    custom_tags text[] default '{}',
    custom_emotions jsonb default '[]',
    custom_checklist text[] default '{}',
    initial_capital numeric default 100000,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table user_settings enable row level security;

create policy "Users can view own settings"
    on user_settings for select
    using (auth.uid() = user_id);

create policy "Users can insert own settings"
    on user_settings for insert
    with check (auth.uid() = user_id);

create policy "Users can update own settings"
    on user_settings for update
    using (auth.uid() = user_id);
```

## 4. 配置 Storage（图片存储）

1. 点击左侧菜单 "Storage"
2. 点击 "New bucket"
3. 创建名为 `trade-screenshots` 的 bucket
4. 在 bucket 设置中：
   - 选择 "Public bucket"
   - 设置 "Allowed MIME types": `image/*`

5. 执行以下 SQL 配置 RLS：

```sql
-- 允许用户上传自己的截图
CREATE POLICY "Users can upload own screenshots"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'trade-screenshots' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);

-- 允许用户查看自己的截图
CREATE POLICY "Users can view own screenshots"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'trade-screenshots' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);

-- 允许用户删除自己的截图
CREATE POLICY "Users can delete own screenshots"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'trade-screenshots' AND
    auth.uid() = (storage.foldername(name))[1]::uuid
);
```

## 5. 配置邮件服务（可选）

如需邮件验证功能：

1. 进入 "Authentication" → "Providers"
2. 确保 "Email" 已启用
3. 配置邮件模板（可选）

## 6. 测试部署

1. 打开 `index.html` 文件
2. 使用 Live Server 或类似工具运行
3. 测试以下功能：
   - 注册新用户
   - 登录
   - 添加交易记录
   - 数据同步

## 7. 生产部署

### 静态托管选项

1. **Vercel**（推荐）
   - 连接 GitHub 仓库自动部署
   - 免费且快速

2. **Netlify**
   - 拖拽式部署
   - 支持自定义域名

3. **GitHub Pages**
   - 免费静态托管
   - 适合开源项目

### 配置步骤（Vercel）

1. 将代码推送到 GitHub
2. 登录 [Vercel](https://vercel.com)
3. 点击 "New Project"
4. 导入 GitHub 仓库
5. 框架预设选择 "Other"
6. 点击 "Deploy"

## 8. 故障排除

### 问题1: RLS 权限错误

**解决**: 确保已正确启用 RLS 并创建了对应的 policy

### 问题2: 跨域错误

**解决**: 在 Supabase 设置中添加你的域名到 "API Settings" → "CORS"

### 问题3: 数据不同步

**解决**: 
1. 检查浏览器控制台是否有错误
2. 确认 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 配置正确
3. 检查网络连接

## 9. 安全建议

1. 不要在代码中暴露 `service_role` 密钥
2. 使用强密码
3. 启用邮件验证（生产环境）
4. 定期备份数据（导出 JSON）

## 10. 更新日志

### v1.0.0
- 初始版本发布
- 支持完整的交易记录、分析、报告功能
- 云端数据同步
