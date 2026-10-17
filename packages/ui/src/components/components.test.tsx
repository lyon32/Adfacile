import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Amount, formatLocalMoney, formatUsdApprox, formatXaf } from './amount';
import { Field } from './field';
import { ModelCard } from './model-card';
import { CAMPAIGN_STATUSES, StatusBadge, statusTone } from './status-badge';

afterEach(cleanup);

describe('Montant (DS §3)', () => {
  it('sépare les milliers par une espace fine en français', () => {
    expect(formatXaf(1250000, 'fr')).toBe('1 250 000 FCFA');
    expect(formatXaf(5000, 'en')).toBe('5,000 FCFA');
  });

  it('convertit des centimes entiers en dollars', () => {
    expect(formatUsdApprox(1820, 'fr')).toBe('≈ 18,20 $US');
    expect(formatUsdApprox(1820, 'en')).toBe('≈ $18.20');
  });

  it('refuse un montant non entier', () => {
    expect(() => formatXaf(10.5, 'fr')).toThrow(RangeError);
    expect(() => formatUsdApprox(Number.NaN, 'fr')).toThrow(RangeError);
  });

  it('affiche les dollars seulement s’ils sont fournis', () => {
    const props = { amountMinor: 5000, currency: 'XAF', minorDigits: 0, locale: 'fr' } as const;
    const { container, rerender } = render(<Amount {...props} />);
    expect(container.textContent).not.toContain('≈');
    rerender(<Amount {...props} usdCents={825} size="lg" />);
    expect(container.textContent).toContain('≈');
  });
});

describe('Montant en monnaie locale : unités mineures de chaque monnaie (S15b)', () => {
  const nbsp = ' ';
  it('FCFA (XAF et XOF, 0 décimale) : « 21 000 FCFA »', () => {
    expect(formatLocalMoney(21000, 'XAF', 0, 'fr')).toBe(`21${nbsp}000 FCFA`);
    expect(formatLocalMoney(21000, 'XOF', 0, 'en')).toBe('21,000 FCFA');
  });
  it('naira (2 décimales) : 5 250 000 kobo = 52 500,00 NGN', () => {
    expect(formatLocalMoney(5_250_000, 'NGN', 2, 'fr')).toBe(`52${nbsp}500,00 NGN`);
    expect(formatLocalMoney(5_250_000, 'NGN', 2, 'en')).toBe('NGN 52,500.00');
  });
  it('dinar tunisien (3 décimales) : 108 500 millimes = 108,500 TND', () => {
    expect(formatLocalMoney(108_500, 'TND', 3, 'fr')).toBe('108,500 TND');
    expect(formatLocalMoney(108_500, 'TND', 3, 'en')).toBe('TND 108.500');
  });
  it('shilling ougandais (0 décimale) : 129 518 UGX', () => {
    expect(formatLocalMoney(129_518, 'UGX', 0, 'en')).toBe('UGX 129,518');
  });
  it('un montant en dessous de l’unité garde ses zéros : 5 kobo = 0,05 NGN', () => {
    expect(formatLocalMoney(5, 'NGN', 2, 'en')).toBe('NGN 0.05');
  });
  it('exact au-delà de 2^53 : aucune perte via un flottant (texte décimal)', () => {
    expect(formatLocalMoney(9_007_199_254_740_991, 'NGN', 2, 'en')).toBe(
      'NGN 90,071,992,547,409.91',
    );
  });
  it('refuse un montant non entier, un exposant invalide ou un code mal formé', () => {
    expect(() => formatLocalMoney(10.5, 'NGN', 2, 'fr')).toThrow(RangeError);
    expect(() => formatLocalMoney(10, 'NGN', 5, 'fr')).toThrow(RangeError);
    expect(() => formatLocalMoney(10, 'ngn', 2, 'fr')).toThrow(RangeError);
  });
  it('Amount : montant local en grand, dollars dessous', () => {
    const { container } = render(
      <Amount
        amountMinor={5_250_000}
        currency="NGN"
        minorDigits={2}
        usdCents={3500}
        locale="en"
        size="lg"
      />,
    );
    expect(container.textContent).toContain('52,500.00');
    expect(container.textContent).toContain('$35.00');
  });
});

describe('TR-ACC-03 — badge de statut : point + mot', () => {
  it('affiche toujours le mot et associe un ton à chaque statut', () => {
    for (const s of CAMPAIGN_STATUSES) {
      render(<StatusBadge status={s} label={`mot-${s}`} />);
      expect(screen.getByText(`mot-${s}`)).toBeTruthy();
    }
    expect(statusTone('active')).toBe('success');
    expect(statusTone('in_review')).toBe('warn');
    expect(statusTone('rejected')).toBe('error');
    expect(statusTone('draft')).toBe('neutral');
  });
});

describe('Champ à étiquette encastrée', () => {
  it('relie étiquette, aide et erreur au champ', () => {
    render(<Field label="Budget" hint="Aide" error="Erreur" unit="FCFA" />);
    const input = screen.getByLabelText('Budget');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
  });

  it('sans aide ni erreur, rien de décrit', () => {
    render(<Field label="Site" id="site" />);
    expect(screen.getByLabelText('Site').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Carte de modèle', () => {
  it('est un bouton radio nommé par son titre et signale le choix', () => {
    const onChange = vi.fn();
    render(
      <ModelCard
        name="m"
        value="a"
        checked={false}
        onChange={onChange}
        title="Modèle A"
        provider="Fournisseur"
        description="Pour une photo produit"
        pros={['Rapide']}
        cons={['Cher']}
        recommendedLabel="Recommandé"
        busyLabel="Très demandé"
        costLabel="12 crédits"
        costDetail="pour 3 visuels"
      />,
    );
    const radio = screen.getByRole('radio', { name: /Modèle A/ });
    fireEvent.click(radio);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Très demandé')).toBeTruthy();
    expect(screen.getByText('+ Rapide')).toBeTruthy();
  });
});
