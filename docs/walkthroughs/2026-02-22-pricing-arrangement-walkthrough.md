# AdFacile — Walkthrough

## 🐳 Docker Dev Setup

Created a **one-command Docker dev setup** that launches both the backend and frontend with hot reload.

### Key Features
- **Hot Reload**: Source code is volume-mounted for live updates.
- **Node 20**: Upgraded base images to satisfy Vite v7 requirements.
- **Simplified**: Removed unused Redis and production-only configurations.

```bash
# Launch both services
docker compose -f docker-compose.dev.yml up --build

# Stop everything
docker compose -f docker-compose.dev.yml down
```

## 💎 Pricing Page Enhancements

Improved the arrangement and aesthetics of the pricing cards for a "premium" feel.

### UI Improvements
- **Pinned Alignment**: CTA buttons are now perfectly aligned at the bottom of cards, regardless of content length.
- **Equal Heights**: Grid cards in the same row always share the same height.
- **Interactive Design**: Added smooth hover scales, enhanced shadows, and a modern "Populaire" badge.
- **Responsive**: Grid adapts fluidly to different screen sizes using `auto-fit`.

---

## 📸 Verification

All systems confirmed running and UI looking premium:

````carousel
![Pricing Page Layout — perfectly aligned buttons](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/pricing_page/layout.png)
<!-- slide -->
![Pricing Card Hover — emerald highlight and depth](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/pricing_page/hover.png)
<!-- slide -->
![Verification Recording](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/pricing_page/verification.webp)
<!-- slide -->
![Backend health check — returns {"status":"UP"}](file:///c:/Users/DELL/Documents/GitHub/Adfacile/docs/assets/docker_setup/backend_health.png)
````
