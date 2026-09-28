# Hoops Live

Watch a basketball video; every time a basket drops in the video, a hoop game
slides in and you get one shot window. Your makes go on a live leaderboard
against 51 simulated players.

Static site (React + Vite). No backend: the video is a YouTube embed and the
basket times are a JSON file.

## Run locally

    npm install
    npm run dev

## Deploy (Vercel)

Import the repo on vercel.com (framework: Vite, build `npm run build`,
output `dist`) or run `npx vercel --prod`.

## Change the video / basket times

- Video: `src/lib/demoVideo.js` (or `?v=<youtube id>` in the URL to try one)
- Basket times: `public/cues/<youtube id>.json`
- Tag baskets: open the site with `?tag`, press B at each basket, Save
  (downloads the JSON; put it in `public/cues/` and redeploy)
