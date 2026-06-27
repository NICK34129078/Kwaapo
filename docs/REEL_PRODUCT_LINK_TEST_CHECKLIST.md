# Reel ↔ product koppeling — testchecklist

Handmatige smoke tests vóór merge/deploy. Geen Supabase-migration nodig (`posts.product_id` bestaat al).

## Upload (seller)

- [ ] **1. Koppelen met actief product** — Business-seller met ≥1 actief product met voorraad: upload video → "Product toevoegen" → picker opent → product kiezen → preview toont foto + naam + prijs → plaatsen → upload slaagt.
- [ ] **2. Zonder product** — Zelfde flow, geen product kiezen → video publiceert normaal.
- [ ] **3. Andere seller product** — Worker weigert `product_id` die niet van uploader is (401/400); app stuurt alleen geselecteerd eigen product.
- [ ] **8. Geen dubbele publicatie** — Picker open/dicht, wijzigen/verwijderen, daarna één keer plaatsen → precies één post in feed/profiel.

## Feed & navigatie

- [ ] **4. Feed-tag** — Video met gekoppeld product toont productkaart ("Bekijk product").
- [ ] **5. Navigatie** — Tik op hele kaart → `ProductDetail` met juiste `productId`.
- [ ] **6. Product verborgen/verwijderd** — Product deactiveren of modereren → reel blijft zichtbaar, geen product-tag (geen kapotte link).
- [ ] **7. Uitverkocht** — Voorraad 0 → tag verdwijnt in feed; reel blijft.

## Performance & regressie

- [ ] **9. Feed performance** — Scroll feed met meerdere reels met producten; geen merkbare vertraging (batch via `fetchProductsByIds` in `attachLinkedProductsToPosts`).
- [ ] Checkout, shop-grid, productdetail koopflow en bestaande video-uploads zonder product blijven werken.

## Geautomatiseerd

```bash
NODE_ENV=test npx tsx src/utils/linkableUploadProducts.test.ts
```

Verwacht: filter logica voor actief + voorraad slaagt.
