import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Cake } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { DashboardFiltersBar } from '@/components/filters/dashboard-filters-bar';
import { QueryState } from '@/components/ui/query-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { KpiCard } from '@/components/charts/kpi-card';
import { ProgressList } from '@/components/charts/progress-bar';
import { Carousel } from '@/components/charts/carousel';
import { BlurFade } from '@/components/motion/blur-fade';
import { PulseHighlight } from '@/components/motion/pulse-highlight';
import { StatusBadge, riskFromPct } from '@/components/charts/status-badge';
import { DataTable } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';
import { BannerInfo } from '@/components/ui/banner-info';
import { usePym } from '@/lib/queries';
import { useGlobalFiltersFromUrl } from '@/lib/use-filters';
import { formatNumber, formatPercent } from '@/lib/utils';
import type { PymResponse } from '@/lib/api';

export function PymPage() {
  const { filters } = useGlobalFiltersFromUrl();
  const q = usePym(filters);
  const data = q.data;

  const alertCols = useMemo<ColumnDef<PymResponse['alertasCohortes'][number]>[]>(
    () => [
      { accessorKey: 'cohorte', header: 'Cohorte / Programa', cell: (i) => <span className="font-bold">{i.getValue() as string}</span> },
      {
        accessorKey: 'poblacion',
        header: () => <span className="block text-right">Población</span>,
        cell: (i) => <span className="block text-right">{formatNumber(i.getValue() as number)}</span>,
      },
      {
        accessorKey: 'pct_cump',
        header: () => <span className="block text-right">Ejec. Real</span>,
        cell: (i) => {
          const v = i.getValue() as number | null;
          const cls = (v ?? 0) < 30 ? 'text-normative-red' : 'text-normative-amber';
          return <span className={`block text-right font-bold ${cls}`}>{formatPercent(v)}</span>;
        },
      },
      {
        id: 'nivel',
        header: 'Nivel',
        cell: (i) => <StatusBadge level={riskFromPct(i.row.original.pct_cump)} />,
      },
      {
        id: 'desv',
        header: () => <span className="block text-right">Desviación</span>,
        cell: (i) => {
          const v = i.row.original.pct_cump ?? 0;
          return <span className="block text-right text-normative-red">{formatPercent(v - 80)}</span>;
        },
      },
    ],
    [],
  );

  return (
    <PageShell title="PyM / RIAS" badge="Grupo etario pendiente Fase A" badgeVariant="warning">
      <DashboardFiltersBar soloConveniosNt />
      <QueryState isLoading={q.isLoading} isFetching={q.isFetching} isError={q.isError} error={q.error} empty={!data}>
        {data && (
          <>
            <BannerInfo
              variant="warning"
              title="KPIs de detección temprana parcialmente disponibles"
              description="Los valores son % cumplimiento sobre programas PyM. No hay denominador poblacional ni meta NT cargada para coberturas; el grupo etario espera Fase A del ETL."
            />

            <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.topProgramas.slice(0, 3).map((p, i) => (
                <BlurFade key={p.pym} delay={i * 0.06}>
                  <KpiCard
                    label={p.pym}
                    value={formatPercent(p.pct_cump)}
                    ticker={
                      p.pct_cump != null ? { value: p.pct_cump, decimals: 1, suffix: '%' } : undefined
                    }
                    caption="% cumplimiento"
                    progress={p.pct_cump ?? 0}
                    accent={(p.pct_cump ?? 0) >= 60 ? 'green' : (p.pct_cump ?? 0) >= 40 ? 'amber' : 'red'}
                    delta={{ value: `${formatNumber(p.n)} citas`, variant: 'neutral' }}
                  />
                </BlurFade>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <Carousel
                  title="Cumplimiento por Programa PyM"
                  description={`${data.topProgramas.length} programas en el filtro actual`}
                  items={data.topProgramas}
                  pageSize={6}
                  renderPage={(slice) => (
                    <ProgressList
                      items={slice.map((p) => ({
                        label: `${p.pym} (${formatNumber(p.n)} citas)`,
                        value: p.pct_cump ?? 0,
                        display: formatPercent(p.pct_cump),
                        tone: (p.pct_cump ?? 0) >= 60 ? 'green' : (p.pct_cump ?? 0) >= 40 ? 'amber' : 'red',
                      }))}
                    />
                  )}
                />
              </div>

              <Card className="flex flex-col p-6 lg:col-span-5">
                <CardHeader className="p-0 pb-6">
                  <CardTitle>Ejecución CUPS P&amp;P por Grupo Etario</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 items-center justify-center p-0 text-center">
                  <div>
                    <Cake className="mx-auto h-16 w-16 text-on-surface-variant opacity-40" />
                    <p className="mt-2 font-bold text-on-surface">Pendiente Fase A</p>
                    <p className="mt-1 text-[12px] text-on-surface-variant">
                      <code>costos</code> aún no incluye <code>fecha_nacimiento</code> /{' '}
                      <code>grupo_etario</code>.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>

            <PulseHighlight active={data.alertasCohortes.length > 0}>
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-outline-variant/30 bg-error-container/10 px-6 py-4">
                  <CardTitle>Alertas de Cohortes (Cumplimiento &lt; 80%)</CardTitle>
                  <Badge variant="danger">{data.alertasCohortes.length} críticas</Badge>
                </div>
                <DataTable data={data.alertasCohortes} columns={alertCols} alertHeader />
              </Card>
            </PulseHighlight>
          </>
        )}
      </QueryState>
    </PageShell>
  );
}
