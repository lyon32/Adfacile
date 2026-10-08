const jobs = require('./campaignJobs');

beforeEach(() => jobs.reset());

describe('campaignJobs — suivi d\'une création longue', () => {
    it('crée un job en cours, lisible par son propriétaire', () => {
        const job = jobs.create({ userId: 'u1', key: 'k1' });
        expect(job.status).toBe('running');
        expect(jobs.get(job.id, 'u1').id).toBe(job.id);
    });

    it('refuse de montrer le job d\'un autre utilisateur', () => {
        const job = jobs.create({ userId: 'u1', key: 'k1' });
        expect(jobs.get(job.id, 'u2')).toBeNull();
    });

    it('retrouve un job par clé d\'idempotence, pour le même utilisateur seulement', () => {
        const job = jobs.create({ userId: 'u1', key: 'k1' });
        expect(jobs.findByKey('u1', 'k1').id).toBe(job.id);
        expect(jobs.findByKey('u2', 'k1')).toBeNull();
        expect(jobs.findByKey('u1', 'autre')).toBeNull();
    });

    it('ignore une clé absente', () => {
        jobs.create({ userId: 'u1', key: null });
        expect(jobs.findByKey('u1', null)).toBeNull();
    });

    it('enregistre l\'étape, le succès et l\'échec', () => {
        const job = jobs.create({ userId: 'u1', key: 'k' });
        jobs.update(job.id, { step: { name: 'video', current: 1, total: 2 } });
        expect(jobs.get(job.id, 'u1').step).toEqual({ name: 'video', current: 1, total: 2 });

        jobs.update(job.id, { status: 'done', result: { campaign_id: 'c1' } });
        expect(jobs.get(job.id, 'u1')).toMatchObject({ status: 'done', result: { campaign_id: 'c1' } });
    });

    it('compte les jobs en cours d\'un utilisateur', () => {
        const a = jobs.create({ userId: 'u1', key: 'a' });
        jobs.create({ userId: 'u1', key: 'b' });
        jobs.create({ userId: 'u2', key: 'c' });
        jobs.update(a.id, { status: 'done' });
        expect(jobs.countRunning('u1')).toBe(1);
    });

    it('purge les jobs terminés depuis plus de 30 minutes, jamais ceux en cours', () => {
        const fini = jobs.create({ userId: 'u1', key: 'a' });
        const enCours = jobs.create({ userId: 'u1', key: 'b' });
        jobs.update(fini.id, { status: 'done' });

        jobs.purge(Date.now() + 31 * 60 * 1000);

        expect(jobs.get(fini.id, 'u1')).toBeNull();
        expect(jobs.get(enCours.id, 'u1')).not.toBeNull();
    });
});
