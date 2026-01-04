import { SupabaseClient } from '@supabase/supabase-js';

type Platform = 'meta' | 'google';

type AccountInput = {
    external_id: string;
    name?: string;
    status?: string;
    currency?: string;
    timezone?: string;
};

type CampaignInput = {
    external_id: string;
    account_external_id?: string;
    name?: string;
    status?: string;
    objective?: string;
    start_date?: string;
    end_date?: string;
    budget?: number;
    budget_type?: string;
    metadata?: Record<string, unknown>;
};

type AdSetInput = {
    external_id: string;
    account_external_id?: string;
    campaign_external_id?: string;
    name?: string;
    status?: string;
    optimization_goal?: string;
    bid_strategy?: string;
    daily_budget?: number;
    start_date?: string;
    end_date?: string;
    targeting?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
};

type CreativeInput = {
    external_id: string;
    account_external_id?: string;
    ad_set_external_id?: string;
    campaign_external_id?: string;
    name?: string;
    status?: string;
    creative_type?: string;
    thumbnail_url?: string;
    headline?: string;
    description?: string;
    destination?: string;
    metadata?: Record<string, unknown>;
};

type MetricInput = {
    date: string; // YYYY-MM-DD
    account_external_id: string;
    campaign_external_id?: string;
    ad_set_external_id?: string;
    ad_external_id?: string;
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    conversions_mql?: number;
    conversions_opportunity?: number;
    conversions_sale?: number;
    revenue?: number;
    ctr?: number;
    cpc?: number;
    cpm?: number;
    cpl?: number;
};

export type IngestPayload = {
    organizationId: string;
    projectId: string;
    platform: Platform;
    accounts: AccountInput[];
    campaigns?: CampaignInput[];
    adSets?: AdSetInput[];
    creatives?: CreativeInput[];
    metrics: MetricInput[];
};

type IdMap = {
    accounts: Record<string, string>;
    campaigns: Record<string, string>;
    adSets: Record<string, string>;
    creatives: Record<string, string>;
};

type CampaignAccountMap = Record<string, string>;

async function ensureAccount(
    sb: SupabaseClient,
    orgId: string,
    projectId: string,
    platform: Platform,
    account: AccountInput
): Promise<string> {
    const { data, error } = await sb
        .from('ad_accounts')
        .upsert(
            {
                organization_id: orgId,
                project_id: projectId,
                platform,
                external_id: account.external_id,
                name: account.name ?? null,
                status: account.status ?? null,
                currency: account.currency ?? null,
                timezone: account.timezone ?? null,
            },
            { onConflict: 'organization_id,platform,external_id' }
        )
        .select('id')
        .single();

    if (error) throw new Error(`account upsert failed: ${error.message}`);
    return data.id as string;
}

async function ensureCampaign(
    sb: SupabaseClient,
    orgId: string,
    projectId: string,
    platform: Platform,
    accountId: string,
    campaign: CampaignInput
): Promise<string> {
    const { data, error } = await sb
        .from('ad_campaigns')
        .upsert(
            {
                account_id: accountId,
                organization_id: orgId,
                project_id: projectId,
                platform,
                external_id: campaign.external_id,
                name: campaign.name ?? null,
                status: campaign.status ?? null,
                objective: campaign.objective ?? null,
                start_date: campaign.start_date ?? null,
                end_date: campaign.end_date ?? null,
                budget: campaign.budget ?? null,
                budget_type: campaign.budget_type ?? null,
                metadata: campaign.metadata ?? null,
            },
            { onConflict: 'account_id,external_id' }
        )
        .select('id')
        .single();
    if (error) throw new Error(`campaign upsert failed: ${error.message}`);
    return data.id as string;
}

async function ensureAdSet(
    sb: SupabaseClient,
    orgId: string,
    projectId: string,
    platform: Platform,
    accountId: string,
    adSet: AdSetInput,
    campaignId?: string
): Promise<string> {
    const { data, error } = await sb
        .from('ad_sets')
        .upsert(
            {
                account_id: accountId,
                campaign_id: campaignId ?? null,
                organization_id: orgId,
                project_id: projectId,
                platform,
                external_id: adSet.external_id,
                name: adSet.name ?? null,
                status: adSet.status ?? null,
                optimization_goal: adSet.optimization_goal ?? null,
                bid_strategy: adSet.bid_strategy ?? null,
                daily_budget: adSet.daily_budget ?? null,
                start_date: adSet.start_date ?? null,
                end_date: adSet.end_date ?? null,
                targeting: adSet.targeting ?? null,
                metadata: adSet.metadata ?? null,
            },
            { onConflict: 'account_id,external_id' }
        )
        .select('id')
        .single();
    if (error) throw new Error(`ad_set upsert failed: ${error.message}`);
    return data.id as string;
}

async function ensureCreative(
    sb: SupabaseClient,
    orgId: string,
    projectId: string,
    platform: Platform,
    accountId: string,
    creative: CreativeInput,
    campaignId?: string,
    adSetId?: string
): Promise<string> {
    const { data, error } = await sb
        .from('ad_creatives')
        .upsert(
            {
                account_id: accountId,
                campaign_id: campaignId ?? null,
                ad_set_id: adSetId ?? null,
                organization_id: orgId,
                project_id: projectId,
                platform,
                external_id: creative.external_id,
                name: creative.name ?? null,
                status: creative.status ?? null,
                creative_type: creative.creative_type ?? null,
                thumbnail_url: creative.thumbnail_url ?? null,
                headline: creative.headline ?? null,
                description: creative.description ?? null,
                destination: creative.destination ?? null,
                metadata: creative.metadata ?? null,
            },
            { onConflict: 'account_id,external_id' }
        )
        .select('id')
        .single();
    if (error) throw new Error(`creative upsert failed: ${error.message}`);
    return data.id as string;
}

export async function ingestAdsPayload(
    sb: SupabaseClient,
    payload: IngestPayload
): Promise<{ accounts: number; campaigns: number; adSets: number; creatives: number; metrics: number }> {
    const { organizationId, projectId, platform } = payload;
    const idMap: IdMap = { accounts: {}, campaigns: {}, adSets: {}, creatives: {} };
    const campaignAccount: CampaignAccountMap = {};

    // Accounts
    for (const acc of payload.accounts) {
        const id = await ensureAccount(sb, organizationId, projectId, platform, acc);
        idMap.accounts[acc.external_id] = id;
    }

    // Campaigns
    for (const camp of payload.campaigns || []) {
        const accountExternal = camp.account_external_id || payload.accounts[0]?.external_id;
        if (!accountExternal) throw new Error(`account not provided for campaign ${camp.external_id}`);
        const accountId = idMap.accounts[accountExternal];
        if (!accountId) throw new Error(`account not resolved for campaign ${camp.external_id}`);
        const id = await ensureCampaign(sb, organizationId, projectId, platform, accountId, camp);
        idMap.campaigns[camp.external_id] = id;
        campaignAccount[camp.external_id] = accountId;
    }

    // Ad sets
    for (const set of payload.adSets || []) {
        const accountExternal = set.account_external_id || (set.campaign_external_id ? undefined : payload.accounts[0]?.external_id);
        const accountId =
            (set.account_external_id ? idMap.accounts[set.account_external_id] : undefined) ||
            (set.campaign_external_id ? campaignAccount[set.campaign_external_id] : undefined) ||
            (accountExternal ? idMap.accounts[accountExternal] : undefined);

        if (!accountId) throw new Error(`account not resolved for ad set ${set.external_id}`);

        const campaignId = set.campaign_external_id ? idMap.campaigns[set.campaign_external_id] : undefined;
        const id = await ensureAdSet(sb, organizationId, projectId, platform, accountId, set, campaignId);
        idMap.adSets[set.external_id] = id;
    }

    // Creatives
    for (const creative of payload.creatives || []) {
        const accountExternal = creative.account_external_id || (creative.campaign_external_id ? undefined : payload.accounts[0]?.external_id);
        const accountId =
            (creative.account_external_id ? idMap.accounts[creative.account_external_id] : undefined) ||
            (creative.campaign_external_id ? campaignAccount[creative.campaign_external_id] : undefined) ||
            (accountExternal ? idMap.accounts[accountExternal] : undefined);

        if (!accountId) throw new Error(`account not resolved for creative ${creative.external_id}`);

        const campaignId = creative.campaign_external_id ? idMap.campaigns[creative.campaign_external_id] : undefined;
        const adSetId = creative.ad_set_external_id ? idMap.adSets[creative.ad_set_external_id] : undefined;
        const id = await ensureCreative(sb, organizationId, projectId, platform, accountId, creative, campaignId, adSetId);
        idMap.creatives[creative.external_id] = id;
    }

    // Metrics
    for (const m of payload.metrics) {
        const accountId = idMap.accounts[m.account_external_id];
        if (!accountId) throw new Error(`account not resolved for metric ${m.account_external_id}`);
        const campaignId = m.campaign_external_id ? idMap.campaigns[m.campaign_external_id] : null;
        const adSetId = m.ad_set_external_id ? idMap.adSets[m.ad_set_external_id] : null;
        const adId = m.ad_external_id ? idMap.creatives[m.ad_external_id] : null;

        const { error } = await sb.from('ad_metrics_daily').upsert(
            {
                organization_id: organizationId,
                project_id: projectId,
                platform,
                account_id: accountId,
                campaign_id: campaignId,
                ad_set_id: adSetId,
                ad_id: adId,
                date: m.date,
                impressions: m.impressions ?? 0,
                clicks: m.clicks ?? 0,
                spend: m.spend ?? 0,
                leads: m.leads ?? 0,
                conversions_mql: m.conversions_mql ?? 0,
                conversions_opportunity: m.conversions_opportunity ?? 0,
                conversions_sale: m.conversions_sale ?? 0,
                revenue: m.revenue ?? 0,
                ctr: m.ctr ?? null,
                cpc: m.cpc ?? null,
                cpm: m.cpm ?? null,
                cpl: m.cpl ?? null,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,platform,account_id,date,campaign_id,ad_set_id,ad_id' }
        );
        if (error) throw new Error(`metrics upsert failed: ${error.message}`);
    }

    return {
        accounts: payload.accounts.length,
        campaigns: payload.campaigns?.length ?? 0,
        adSets: payload.adSets?.length ?? 0,
        creatives: payload.creatives?.length ?? 0,
        metrics: payload.metrics.length,
    };
}
