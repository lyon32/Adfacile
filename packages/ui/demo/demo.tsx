import { useState, type ReactNode } from 'react';
import {
  Amount,
  Button,
  CAMPAIGN_STATUSES,
  Card,
  CardDescription,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Eyebrow,
  Field,
  FullLoader,
  ModelCard,
  PendingLoader,
  ShortLoader,
  StatusBadge,
  Switch,
} from '../src/index';
import { messages, type DemoLocale } from './messages';

const SWATCHES = [
  ['Obsidienne', 'bg-obsidienne'],
  ['Graphite', 'bg-graphite'],
  ['Lime', 'bg-lime'],
  ['Lime foncé', 'bg-lime-fonce'],
  ['Ardoise', 'bg-ardoise'],
  ['Craie', 'bg-craie'],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-line flex flex-col gap-4 border-t pt-6">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export function Demo({
  initialLocale,
  initialDark,
}: {
  initialLocale: DemoLocale;
  initialDark: boolean;
}) {
  const [locale, setLocale] = useState<DemoLocale>(initialLocale);
  const [dark, setDark] = useState(initialDark);
  const [notif, setNotif] = useState(true);
  const [model, setModel] = useState('a');
  const [loaderRun, setLoaderRun] = useState(0);
  const [pending, setPending] = useState(false);
  const t = messages[locale];

  const toggleDark = (value: boolean) => {
    setDark(value);
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
  };
  const toggleLocale = () => {
    const next = locale === 'fr' ? 'en' : 'fr';
    setLocale(next);
    document.documentElement.lang = next;
  };
  const simulate = (ms: number) => {
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
    }, ms);
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t.title}</h1>
          <p className="text-muted text-sm">{t.intro}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="theme" className="text-sm font-semibold">
            {t.theme}
          </label>
          <Switch id="theme" checked={dark} onCheckedChange={toggleDark} />
          <Button variant="quiet" size="sm" onClick={toggleLocale}>
            {t.language}
          </Button>
        </div>
      </header>

      <Section title={t.palette}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          {SWATCHES.map(([name, cls]) => (
            <li key={name} className="flex flex-col gap-2">
              <span className={`border-line h-14 rounded-md border ${cls}`} />
              <span className="text-meta font-semibold">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t.buttons}>
        <div className="flex flex-wrap gap-3">
          <Button>{t.primary}</Button>
          <Button variant="secondary">{t.secondary}</Button>
          <Button variant="quiet">{t.quiet}</Button>
        </div>
      </Section>

      <Section title={t.fields}>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label={t.budget}
            unit="FCFA"
            inputMode="numeric"
            defaultValue="2 000"
            hint={t.budgetHint}
          />
          <Field label={t.site} type="url" defaultValue="monsite.cm" error={t.siteError} />
        </div>
      </Section>

      <Section title={t.settings}>
        <Card className="flex items-center justify-between gap-4">
          <div>
            <CardTitle id="notif-title">{t.notifTitle}</CardTitle>
            <CardDescription>{t.notifDesc}</CardDescription>
          </div>
          <Switch aria-labelledby="notif-title" checked={notif} onCheckedChange={setNotif} />
        </Card>
      </Section>

      <Section title={t.cards}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-2">
            <Eyebrow>{t.eyebrow}</Eyebrow>
            <Amount
              amountMinor={45000}
              currency="XAF"
              minorDigits={0}
              usdCents={7425}
              locale={locale}
              size="lg"
            />
          </Card>
          <Card className="flex flex-col items-start gap-3">
            <CardTitle>{t.cardTitle}</CardTitle>
            <CardDescription>{t.cardDesc}</CardDescription>
          </Card>
        </div>
      </Section>

      <Section title={t.dialog}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="quiet" className="self-start">
              {t.openDialog}
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={t.close}>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>{t.dialogDesc}</DialogDescription>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <DialogClose asChild>
                <Button variant="quiet">{t.quiet}</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="secondary">{t.confirm}</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title={t.amounts}>
        <div className="flex flex-wrap gap-8">
          <Amount amountMinor={5000} currency="XAF" minorDigits={0} locale={locale} />
          <Amount
            amountMinor={1250000}
            currency="XAF"
            minorDigits={0}
            usdCents={206250}
            locale={locale}
          />
          <Amount
            amountMinor={45000}
            currency="XAF"
            minorDigits={0}
            usdCents={7425}
            locale={locale}
            size="lg"
          />
        </div>
      </Section>

      <Section title={t.badges}>
        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} label={t.statuses[s]} />
          ))}
        </div>
      </Section>

      <Section title={t.models}>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm font-semibold">{t.modelGroup}</legend>
          <ModelCard
            name="model"
            value="a"
            checked={model === 'a'}
            onChange={() => {
              setModel('a');
            }}
            title="Nano Banana"
            provider="Google"
            description={t.modelA}
            pros={t.prosA}
            recommendedLabel={t.reco}
            costLabel={t.credits(12)}
            costDetail={t.detail}
          />
          <ModelCard
            name="model"
            value="b"
            checked={model === 'b'}
            onChange={() => {
              setModel('b');
            }}
            title="Seedream"
            provider="ByteDance"
            description={t.modelB}
            cons={t.consB}
            busyLabel={t.busy}
            costLabel={t.credits(18)}
            costDetail={t.detail}
          />
        </fieldset>
      </Section>

      <Section title={t.loader}>
        <div className="demo-static relative h-56 overflow-hidden rounded-lg">
          <FullLoader key={loaderRun} label={t.loaderLabel} className="absolute z-0" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setLoaderRun((n) => n + 1);
            }}
          >
            {t.replay}
          </Button>
          <ShortLoader label={t.loaderLabel} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              simulate(1000);
            }}
          >
            {t.slow}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              simulate(200);
            }}
          >
            {t.fast}
          </Button>
          <span
            className="inline-flex size-11 items-center justify-center"
            data-testid="pending-slot"
          >
            <PendingLoader pending={pending} label={t.loaderLabel} />
          </span>
        </div>
        <p className="text-meta text-muted">{t.shortNote}</p>
      </Section>
    </main>
  );
}
