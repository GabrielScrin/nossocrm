const fs=require('fs');
const path='features/analytics/AnalyticsPage.tsx';
let s=fs.readFileSync(path,'utf8');
const regex=/\n\s*!isLoading[\s\S]*?\n\s*\);\n\};\n\nexport default AnalyticsPage;$/m;
const replacement=
            <div>
                {conversionsError && (
                    <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200 mb-4">
                        Erro ao carregar conversões.
                    </div>
                )}
                <ConversionsTable conversions={conversions || []} />
                {loadingConversions && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Carregando conversões...</p>
                )}
            </div>

            {!isLoading && !hasData && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                    Nenhum dado de mídia/funil para o período selecionado. Importe dados ou ajuste o intervalo.
                </div>
            )}
        </div>
    );
};

export default AnalyticsPage;;
if(!regex.test(s)) { console.error('block not found'); process.exit(1);} 
s = s.replace(regex, '\n' + replacement);
fs.writeFileSync(path,s,'utf8');
