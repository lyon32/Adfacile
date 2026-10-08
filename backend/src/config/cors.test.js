const { ALLOWED_HEADERS } = require('./cors');

describe('CORS — en-têtes autorisés', () => {
    it("autorise l'en-tête d'idempotence de la création de campagne", () => {
        // Sans lui, le navigateur bloque la requête avec « Network Error ».
        expect(ALLOWED_HEADERS).toContain('Idempotency-Key');
    });

    it("garde l'authentification et le type de contenu", () => {
        expect(ALLOWED_HEADERS).toEqual(expect.arrayContaining(['Authorization', 'Content-Type']));
    });
});
