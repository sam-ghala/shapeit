# Deploying ShapeIt to playshapeit.com

## Step 1: Create a GitHub repo

```bash
# Create the repo on GitHub (or use the GitHub UI)
# Then clone it locally:
git clone https://github.com/YOUR_USERNAME/shapeit.git
cd shapeit
```

## Step 2: Copy project files

Copy ALL the downloaded files into the repo, keeping this structure:

```
shapeit/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── favicon.svg
└── src/
    ├── App.jsx
    ├── index.css
    └── main.jsx
```

## Step 3: Test locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 — verify everything works.

## Step 4: Build for production

```bash
npm run build
```

This creates a `dist/` folder with your static site. You can preview it:

```bash
npm run preview
```

## Step 5: Push to GitHub

```bash
git add .
git commit -m "Initial ShapeIt launch"
git push origin main
```

## Step 6: Connect Cloudflare Pages

1. Go to https://dash.cloudflare.com
2. Click **Workers & Pages** in the left sidebar
3. Click **Create** → **Pages** → **Connect to Git**
4. Select your GitHub repo (`shapeit`)
5. Configure the build:
   - **Framework preset**: `Vite`  (or select None and fill manually)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Node.js version**: Leave default (or set to 18+)
6. Click **Save and Deploy**

Cloudflare will build and deploy. You'll get a URL like `shapeit-xxx.pages.dev`.

## Step 7: Add your custom domain

1. In the Cloudflare Pages project, go to **Custom domains**
2. Click **Set up a custom domain**
3. Enter `playshapeit.com`
4. Cloudflare will automatically configure the DNS since the domain is on your Cloudflare account
5. Also add `www.playshapeit.com` and set it to redirect to `playshapeit.com`
6. Wait a few minutes for DNS propagation

## Step 8: Verify

Visit https://playshapeit.com — your game should be live!

## Automatic deploys

Every time you push to `main` on GitHub, Cloudflare Pages automatically rebuilds and deploys. No manual steps needed.

## Updating the game

```bash
# Make changes to src/App.jsx
# Test locally:
npm run dev

# Deploy:
git add .
git commit -m "Description of changes"
git push origin main
# Cloudflare auto-deploys in ~30 seconds
```

## Troubleshooting

- **Build fails**: Make sure Node.js 18+ is set in Cloudflare Pages environment variables (`NODE_VERSION` = `18`)
- **Blank page**: Check that `index.html` is in the repo root (not inside `src/`)
- **Domain not working**: Check DNS tab in Cloudflare — the CNAME record should point to your Pages project
- **CSS not loading**: Make sure `src/index.css` exists and is imported in `main.jsx`
