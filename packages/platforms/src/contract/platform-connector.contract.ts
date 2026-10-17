// Suite de contrat commune des connecteurs de plateformes (TESTING §6.2). Écrite une fois, lancée sur deux cibles :
// la fausse implémentation à chaque commit (`fake-meta-connector.test.ts`), le vrai service lors du contrôle des
// fournisseurs (TESTING §2.7, avec un compte Meta de test). Une fausse implémentation ne peut ainsi pas « mentir » longtemps.
import { describe, expect, it } from 'vitest';
import { AppError } from '@pubeka/contracts';
import type { PlatformConnector, PlatformToken, PublishSpec } from '../types';

export interface ContractTarget {
  connector: PlatformConnector;
  /** Jeton valide. */
  token: PlatformToken;
  /** Jeton que la plateforme refuse comme expiré ; absent si la cible ne sait pas en fabriquer un. */
  expiredToken?: PlatformToken;
}

export const CONTRACT_SPEC: PublishSpec = {
  campaignName: 'Contrat',
  objective: 'OUTCOME_TRAFFIC',
  adAccountId: 'act_100000000001',
  account: { code: 'USD' },
  page: {
    id: '200000000001',
    name: 'Page de test',
    instagramAccountId: null,
    instagramConnected: false,
    whatsappConnected: false,
    whatsappNumber: null,
    whatsappPhoneNumberId: null,
  },
  destinationType: 'WEBSITE',
  optimizationGoal: 'LINK_CLICKS',
  dailyBudgetUsdCents: 500,
  startDate: '2026-11-01',
  targeting: { locations: [{ key: 'CM', type: 'country' }] },
  websiteUrl: 'https://exemple.test',
  creative: {
    mediaType: 'none',
    message: 'Bonjour',
    headline: 'Titre',
    link: 'https://exemple.test',
  },
};

export function platformConnectorContract(name: string, make: () => ContractTarget): void {
  describe(`${name} — contrat PlatformConnector`, () => {
    it('se déclare disponible et nomme sa plateforme', () => {
      const { connector } = make();
      expect(connector.available).toBe(true);
      expect(connector.platform).toBe('meta');
    });

    it("construit une URL d'autorisation qui porte le state et l'adresse de retour", () => {
      const url = new URL(
        make().connector.authorizeUrl('etat-123', 'https://app.pubeka.test/callback'),
      );
      expect(url.searchParams.get('state')).toBe('etat-123');
      expect(url.searchParams.get('redirect_uri')).toBe('https://app.pubeka.test/callback');
    });

    it('liste des comptes publicitaires et des Pages identifiés', async () => {
      const { connector, token } = make();
      const accounts = await connector.listAdAccounts(token);
      const pages = await connector.listPages(token);
      expect(accounts.length).toBeGreaterThan(0);
      expect(accounts.every((a) => a.id.length > 0 && typeof a.usable === 'boolean')).toBe(true);
      expect(pages.every((p) => p.id.length > 0 && p.name.length > 0)).toBe(true);
    });

    it('cherche un lieu en lecture seule : une liste (vide si le lieu est inconnu)', async () => {
      const { connector, token } = make();
      const found = await connector.searchLocations(token, {
        name: 'Lieu-qui-n-existe-pas-zzz',
        countryCode: 'CM',
        type: 'city',
      });
      expect(Array.isArray(found)).toBe(true);
      expect(found).toHaveLength(0);
    });

    it('rend un bilan de santé sans jeton ni secret', async () => {
      const { connector, token } = make();
      const items = await connector.healthCheck(
        token,
        CONTRACT_SPEC.adAccountId,
        CONTRACT_SPEC.page.id,
      );
      expect(items.length).toBeGreaterThan(0);
      expect(JSON.stringify(items)).not.toContain(token.accessToken);
      for (const item of items) expect(['ok', 'missing', 'warning']).toContain(item.status);
    });

    it('crée une campagne en pause et renvoie ses identifiants', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      expect(refs.campaignId).toBeTruthy();
      expect(refs.adsetId).toBeTruthy();
      expect(refs.adId).toBeTruthy();
      expect((await connector.getStatus(token, refs)).status).toBe('paused');
    });

    it('active puis remet en pause', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      await connector.resume(token, refs);
      expect(['active', 'in_review']).toContain((await connector.getStatus(token, refs)).status);
      await connector.pause(token, refs);
      expect((await connector.getStatus(token, refs)).status).toBe('paused');
    });

    it('refuse un budget sous 1 $ par budget_too_low (TR-PLA-10)', async () => {
      const { connector, token } = make();
      await expect(
        connector.createCampaign(token, { ...CONTRACT_SPEC, dailyBudgetUsdCents: 99 }),
      ).rejects.toMatchObject({
        code: 'budget_too_low',
      });
    });

    it('modifie le budget et le nom sans erreur, et refuse un budget trop bas', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      await expect(
        connector.updateCampaign(token, refs, {
          name: 'Autre',
          dailyBudgetUsdCents: 800,
          account: CONTRACT_SPEC.account,
        }),
      ).resolves.toBeUndefined();
      await expect(
        connector.updateCampaign(token, refs, {
          dailyBudgetUsdCents: 10,
          account: CONTRACT_SPEC.account,
        }),
      ).rejects.toMatchObject({ code: 'budget_too_low' });
    });

    it('ne signale aucun refus pour une campagne qui n’est pas refusée', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      expect(await connector.fetchRejection(token, refs)).toBeNull();
    });

    it('rend des statistiques journalières entières, dans la période demandée', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      const days = await connector.fetchStats(token, refs, {
        since: '2026-11-01',
        until: '2026-11-07',
      });
      for (const day of days) {
        expect(day.date >= '2026-11-01' && day.date <= '2026-11-07').toBe(true);
        for (const value of [
          day.spendUsdCents,
          day.impressions,
          day.reach,
          day.clicks,
          day.results,
        ]) {
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    });

    it('supprime la campagne et le dit', async () => {
      const { connector, token } = make();
      const refs = await connector.createCampaign(token, CONTRACT_SPEC);
      expect(await connector.deleteCampaign(token, refs)).toBe(true);
    });

    it('convertit un jeton expiré en meta_token_expired, pour chaque opération', async () => {
      const { connector, expiredToken } = make();
      if (!expiredToken) return;
      const refs = { campaignId: '1', adsetId: '2', adId: '3', creativeId: null };
      for (const call of [
        connector.listAdAccounts(expiredToken),
        connector.listPages(expiredToken),
        connector.createCampaign(expiredToken, CONTRACT_SPEC),
        connector.pause(expiredToken, refs),
        connector.getStatus(expiredToken, refs),
      ]) {
        await expect(call).rejects.toMatchObject({ code: 'meta_token_expired' });
      }
    });

    it('ne laisse jamais sortir une erreur brute : toujours une AppError', async () => {
      const { connector, token } = make();
      const erreur = await connector
        .getStatus(token, {
          campaignId: 'inexistante',
          adsetId: null,
          adId: null,
          creativeId: null,
        })
        .catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(AppError);
    });
  });
}
