# Hot Stove Tracker — Free Supabase + Vercel Setup Guide

## Step 1: Finish Your Supabase Setup
1. In your Supabase project dashboard, copy your **Project URL** (`https://xxxx.supabase.co`).
2. Open **API Keys** and copy both:
   - **`anon` / `publishable` key**
   - **`service_role` / `secret` key**
3. Click **SQL Editor** in the left sidebar -> **New Query**, paste the entire contents of `supabase_schema.sql`, and click **Run**.

## Step 2: Upload This Folder to GitHub
1. Create a free account at [github.com](https://github.com) and click **New Repository** (name it `hot-stove-tracker`).
2. Click **uploading an existing file**, drag all files from this unzipped folder into the browser, and click **Commit changes**.

## Step 3: Deploy Free on Vercel
1. Sign up free at [vercel.com](https://vercel.com) using your GitHub account.
2. Click **Add New -> Project** and import `hot-stove-tracker`.
3. Open **Environment Variables** and add these 5 variables:
   - `VITE_SUPABASE_URL` = Your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = Your Supabase `anon` / `publishable` key
   - `SUPABASE_URL` = Your Supabase Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = Your Supabase `service_role` / `secret` key
   - `ADMIN_PASSWORD` = Choose your secret password for the Lock icon
4. Click **Deploy**. Once live, open your URL and click **Sync Now**!
