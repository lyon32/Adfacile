import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Amount, formatUsdApprox, formatXaf } from './amount';
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
    const { container, rerender } = render(<Amount amountXaf={5000} locale="fr" />);
    expect(container.textContent).not.toContain('≈');
    rerender(<Amount amountXaf={5000} usdCents={825} locale="fr" size="lg" />);
    expect(container.textContent).toContain('≈');
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
