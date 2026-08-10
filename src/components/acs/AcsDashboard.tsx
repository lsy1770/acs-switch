import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  KeyRound,
  Layers3,
  Loader2,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@/types";
import { providersApi, settingsApi, type AppId } from "@/lib/api";
import { deeplinkApi } from "@/lib/api/deeplink";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACS_ORIGIN = "https://acsgw.top";
const ACS_KEYS_URL = `${ACS_ORIGIN}/app/api-keys`;

type AcsAppId = Exclude<AppId, "claude-desktop">;

interface AcsDashboardProps {
  onOpenAdvanced: (app: AcsAppId) => void;
}

interface AppSnapshot {
  providers: Record<string, Provider>;
  currentProviderId: string;
}

interface AppDefinition {
  id: AcsAppId;
  name: string;
  shortName: string;
  endpoint: string;
  icon: string;
  accent: string;
  tint: string;
}

const APPS: AppDefinition[] = [
  {
    id: "claude",
    name: "Claude Code",
    shortName: "Claude",
    endpoint: "/claude",
    icon: "claude",
    accent: "bg-[#c96f48]",
    tint: "bg-[#c96f48]/10",
  },
  {
    id: "codex",
    name: "Codex",
    shortName: "Codex",
    endpoint: "/openai",
    icon: "openai",
    accent: "bg-[#166f5f]",
    tint: "bg-[#166f5f]/10",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    shortName: "Gemini",
    endpoint: "/gemini",
    icon: "gemini",
    accent: "bg-[#3978d5]",
    tint: "bg-[#3978d5]/10",
  },
  {
    id: "grokbuild",
    name: "Grok Build",
    shortName: "Grok",
    endpoint: "/grok/v1",
    icon: "grok",
    accent: "bg-[#22252a] dark:bg-[#d7d7d7]",
    tint: "bg-black/5 dark:bg-white/10",
  },
  {
    id: "opencode",
    name: "OpenCode",
    shortName: "OpenCode",
    endpoint: "/v1",
    icon: "opencode",
    accent: "bg-[#d99519]",
    tint: "bg-[#d99519]/10",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    shortName: "OpenClaw",
    endpoint: "/v1",
    icon: "openclaw",
    accent: "bg-[#d9553f]",
    tint: "bg-[#d9553f]/10",
  },
  {
    id: "hermes",
    name: "Hermes",
    shortName: "Hermes",
    endpoint: "/v1",
    icon: "hermes",
    accent: "bg-[#94652d]",
    tint: "bg-[#94652d]/10",
  },
];

function isAcsProvider(provider: Provider): boolean {
  return (
    provider.websiteUrl?.startsWith(ACS_ORIGIN) === true ||
    provider.name.startsWith("ACS Gateway") ||
    provider.notes?.startsWith("Managed by ACS Gateway profile") === true
  );
}

function getProviderModel(app: AcsAppId, provider: Provider): string {
  const settings = provider.settingsConfig ?? {};
  if (app === "claude") {
    return settings.env?.ANTHROPIC_MODEL || "自动路由";
  }
  if (app === "gemini") {
    return settings.env?.GEMINI_MODEL || "自动路由";
  }
  if (app === "codex") {
    const config = typeof settings.config === "string" ? settings.config : "";
    return config.match(/^model\s*=\s*["']([^"']+)["']/m)?.[1] || "自动路由";
  }
  if (app === "grokbuild") {
    const config = typeof settings.config === "string" ? settings.config : "";
    return config.match(/^model\s*=\s*["']([^"']+)["']/m)?.[1] || "自动路由";
  }

  const models = settings.models;
  if (Array.isArray(models)) {
    return models[0]?.id || models[0]?.name || "自动路由";
  }
  if (models && typeof models === "object") {
    return Object.keys(models)[0] || "自动路由";
  }
  return "自动路由";
}

function getProviderGroups(provider: Provider): string {
  const groups = provider.notes?.match(/^Groups:\s*(.+)$/m)?.[1]?.trim();
  return groups || "按密钥绑定分组";
}

function getProfileLabel(provider: Provider): string {
  return provider.name.replace(/^ACS Gateway\s*-\s*/i, "") || "默认配置";
}

export function AcsDashboard({ onOpenAdvanced }: AcsDashboardProps) {
  const queryClient = useQueryClient();
  const [snapshots, setSnapshots] = useState<
    Partial<Record<AcsAppId, AppSnapshot>>
  >({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [provisionValue, setProvisionValue] = useState("");
  const [importing, setImporting] = useState(false);
  const [switching, setSwitching] = useState("");

  const loadSnapshots = useCallback(async () => {
    setLoadError("");
    try {
      const entries = await Promise.all(
        APPS.map(async ({ id }) => {
          const [providers, currentProviderId] = await Promise.all([
            providersApi.getAll(id),
            providersApi.getCurrent(id),
          ]);
          return [id, { providers, currentProviderId }] as const;
        }),
      );
      setSnapshots(Object.fromEntries(entries));
    } catch (error) {
      setLoadError(extractErrorMessage(error) || "无法读取本机工具配置");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshots();
    const refresh = () => void loadSnapshots();
    window.addEventListener("acs-profile-imported", refresh);
    return () => window.removeEventListener("acs-profile-imported", refresh);
  }, [loadSnapshots]);

  const connectedApps = APPS.filter(({ id }) => {
    const snapshot = snapshots[id];
    return Object.values(snapshot?.providers ?? {}).some(isAcsProvider);
  }).length;

  const totalProfiles = new Set(
    APPS.flatMap(({ id }) =>
      Object.values(snapshots[id]?.providers ?? {})
        .filter(isAcsProvider)
        .map(getProfileLabel),
    ),
  ).size;

  const handleOpenGateway = async () => {
    try {
      await settingsApi.openExternal(ACS_KEYS_URL);
    } catch (error) {
      toast.error(extractErrorMessage(error) || "无法打开 ACS Gateway");
    }
  };

  const handleImport = async () => {
    const value = provisionValue.trim();
    if (!value) {
      toast.error("请粘贴 ACS 一次性配置链接或配置码");
      return;
    }

    const url = value.startsWith("acsswitch://")
      ? value
      : `acsswitch://v1/import?resource=acs-profile&token=${encodeURIComponent(value)}`;

    setImporting(true);
    try {
      const request = await deeplinkApi.parseDeeplink(url);
      if (request.resource !== "acs-profile") {
        throw new Error("这不是 ACS Gateway 配置链接");
      }
      const result = await deeplinkApi.importFromDeeplink(request);
      if (!("type" in result) || result.type !== "acs-profile") {
        throw new Error("ACS Gateway 返回了无效配置");
      }
      await Promise.all(
        result.apps.map((app) =>
          queryClient.invalidateQueries({ queryKey: ["providers", app] }),
        ),
      );
      setProvisionValue("");
      await loadSnapshots();
      window.dispatchEvent(new CustomEvent("acs-profile-imported"));
      toast.success(`已导入 ${result.profileName}`, {
        description: `已配置 ${result.apps.length} 个编程工具`,
      });
    } catch (error) {
      toast.error("导入失败", {
        description: extractErrorMessage(error) || String(error),
      });
    } finally {
      setImporting(false);
    }
  };

  const handleSwitch = async (app: AcsAppId, provider: Provider) => {
    const operation = `${app}:${provider.id}`;
    setSwitching(operation);
    try {
      await providersApi.switch(provider.id, app);
      await queryClient.invalidateQueries({ queryKey: ["providers", app] });
      await loadSnapshots();
      toast.success(`${APPS.find((item) => item.id === app)?.name} 已切换`, {
        description: `${getProfileLabel(provider)} / ${getProviderModel(app, provider)}`,
      });
    } catch (error) {
      toast.error("切换失败", {
        description: extractErrorMessage(error) || String(error),
      });
    } finally {
      setSwitching("");
    }
  };

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden px-5 pb-10 pt-1 sm:px-6">
      <section
        className="relative isolate overflow-hidden rounded-[28px] border border-[#244942] bg-[#0d2d28] px-5 py-6 text-[#f4f1e8] shadow-[0_24px_70px_-34px_rgba(13,45,40,0.8)] sm:px-8 sm:py-8"
        style={{
          backgroundImage:
            "radial-gradient(circle at 82% 18%, rgba(232,176,76,.2), transparent 27%), linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
          backgroundSize: "auto, 34px 34px, 34px 34px",
        }}
      >
        <div className="absolute -right-14 -top-20 h-64 w-64 rounded-full border border-[#edb04d]/20" />
        <div className="absolute -right-2 -top-8 h-40 w-40 rounded-full border border-[#edb04d]/25" />

        <div className="relative grid gap-8 xl:grid-cols-[1.25fr_.75fr] xl:items-end">
          <div>
            <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.24em] text-[#edb04d]">
              <span className="h-2 w-2 rounded-full bg-[#edb04d] shadow-[0_0_16px_#edb04d]" />
              ACS CONTROL DESK
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold leading-[1.08] tracking-[-0.035em] sm:text-5xl">
              你的编程工具，
              <span className="text-[#edb04d]">一处配置，一键切换。</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-[#c5d4cf] sm:text-base">
              不再手改 JSON、环境变量和端点。选择 ACS 分组与模型后，自动写入
              Claude Code、Codex、Gemini CLI 等本机配置。
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                onClick={() => void handleOpenGateway()}
                className="h-11 rounded-full bg-[#edb04d] px-5 font-semibold text-[#17332e] hover:bg-[#f5c66f]"
              >
                创建或选择配置
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenAdvanced("claude")}
                className="h-11 rounded-full border-white/20 bg-white/5 px-5 text-[#f4f1e8] hover:bg-white/10 hover:text-white"
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                高级管理
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
            <HeroMetric
              label="已接入工具"
              value={`${connectedApps}/${APPS.length}`}
            />
            <HeroMetric label="配置档案" value={String(totalProfiles)} />
            <div className="col-span-2 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 sm:col-span-1 xl:col-span-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#91aaa3]">
                固定网关
              </div>
              <div className="mt-1 flex items-center gap-2 font-mono text-sm text-[#e7eee9]">
                <ShieldCheck className="h-4 w-4 text-[#73c6a8]" />
                https://acsgw.top
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-3 -mt-3 grid gap-px overflow-hidden rounded-2xl border bg-border shadow-sm sm:grid-cols-3">
        <FlowStep
          number="01"
          title="在 ACS 选择"
          detail="密钥、分组与可用模型"
        />
        <FlowStep
          number="02"
          title="发送一次性配置"
          detail="链接不携带长期密钥"
        />
        <FlowStep number="03" title="本机一键切换" detail="自动备份原有配置" />
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#b27a17]">
                HARNESS MATRIX
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                工具与当前配置
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadSnapshots()}
              disabled={loading}
              className="text-muted-foreground"
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
              />
              刷新
            </Button>
          </div>

          {loadError && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <CircleAlert className="h-4 w-4 shrink-0" />
              {loadError}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {APPS.map((app) => {
              const snapshot = snapshots[app.id];
              const acsProviders = Object.values(
                snapshot?.providers ?? {},
              ).filter(isAcsProvider);
              const activeProvider = acsProviders.find(
                (provider) => provider.id === snapshot?.currentProviderId,
              );

              return (
                <article
                  key={app.id}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_8px_28px_-24px_rgba(15,45,39,.8)] transition-colors hover:border-[#aebfb8]"
                >
                  <div
                    className={cn("absolute inset-y-0 left-0 w-1", app.accent)}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                          app.tint,
                        )}
                      >
                        <ProviderIcon
                          icon={app.icon}
                          name={app.name}
                          size={24}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{app.name}</h3>
                        <code className="text-[11px] text-muted-foreground">
                          {ACS_ORIGIN}
                          {app.endpoint}
                        </code>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[10px] font-semibold",
                        activeProvider
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {activeProvider
                        ? "ACS 已启用"
                        : acsProviders.length
                          ? "待切换"
                          : "未配置"}
                    </span>
                  </div>

                  {acsProviders.length ? (
                    <div className="mt-4 space-y-2">
                      {acsProviders.map((provider) => {
                        const isActive =
                          provider.id === snapshot?.currentProviderId;
                        const operation = `${app.id}:${provider.id}`;
                        return (
                          <button
                            type="button"
                            key={provider.id}
                            disabled={isActive || switching === operation}
                            onClick={() => void handleSwitch(app.id, provider)}
                            className={cn(
                              "w-full rounded-xl border px-3 py-2.5 text-left transition-all",
                              isActive
                                ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20"
                                : "border-transparent bg-muted/55 hover:border-border hover:bg-muted",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-semibold">
                                    {getProfileLabel(provider)}
                                  </span>
                                  {isActive && (
                                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                  )}
                                </div>
                                <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="truncate">
                                    {getProviderGroups(provider)}
                                  </span>
                                  <span>·</span>
                                  <span className="truncate font-mono">
                                    {getProviderModel(app.id, provider)}
                                  </span>
                                </div>
                              </div>
                              {switching === operation ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                              ) : (
                                !isActive && (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleOpenGateway()}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-dashed px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-[#8da69d] hover:bg-muted/50 hover:text-foreground"
                    >
                      导入此工具的 ACS 配置
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border bg-card p-5 shadow-[0_12px_38px_-30px_rgba(15,45,39,.75)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edb04d]/15 text-[#9a6910]">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">导入 ACS 配置</h2>
                <p className="text-xs text-muted-foreground">
                  浏览器未自动唤起时使用
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              粘贴 ACS
              网站生成的一次性配置链接或配置码。配置码使用后立即失效，不会保存到界面。
            </p>
            <Input
              type="password"
              value={provisionValue}
              onChange={(event) => setProvisionValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !importing) void handleImport();
              }}
              placeholder="acsswitch://... 或一次性配置码"
              className="mt-4 h-11 rounded-xl font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              onClick={() => void handleImport()}
              disabled={importing || !provisionValue.trim()}
              className="mt-3 h-11 w-full rounded-xl bg-[#176d5d] text-white hover:bg-[#11594d]"
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {importing ? "正在安全导入" : "导入并自动配置"}
            </Button>
          </section>

          <section className="rounded-2xl border border-[#d8c69d] bg-[#fbf5e8] p-5 text-[#4d442f] dark:border-[#665a3d] dark:bg-[#2b281f] dark:text-[#e9dfc7]">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-[#17816d]" />
              配置安全边界
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 opacity-80">
              <li className="flex gap-2">
                <Route className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                端点固定为 acsgw.top，导入时拒绝替换。
              </li>
              <li className="flex gap-2">
                <Layers3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                切换前保留原有工具配置，可随时返回高级管理。
              </li>
            </ul>
          </section>
        </aside>
      </section>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.065] px-4 py-3 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#91aaa3]">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

function FlowStep({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-4 py-3.5">
      <span className="font-mono text-xs font-semibold text-[#b27a17]">
        {number}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
