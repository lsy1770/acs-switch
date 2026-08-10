import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DeepLinkImportRequest } from "@/lib/api/deeplink";

interface AcsProfileConfirmationProps {
  request: DeepLinkImportRequest;
}

export function AcsProfileConfirmation({
  request,
}: AcsProfileConfirmationProps) {
  const { t } = useTranslation();
  const token = request.provisionToken ?? "";
  const maskedToken = token ? `${token.slice(0, 6)}${"*".repeat(18)}` : "****";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        <div className="text-sm">{t("deeplink.acsProfileSecurity")}</div>
      </div>

      <div className="grid grid-cols-3 items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground">
          {t("deeplink.providerName")}
        </div>
        <div className="col-span-2 text-sm font-medium">ACS Gateway</div>
      </div>

      <div className="grid grid-cols-3 items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground">
          {t("deeplink.endpoint")}
        </div>
        <div className="col-span-2 break-all font-mono text-sm">
          https://acsgw.top
        </div>
      </div>

      <div className="grid grid-cols-3 items-center gap-4">
        <div className="text-sm font-medium text-muted-foreground">
          {t("deeplink.provisionToken")}
        </div>
        <div className="col-span-2 font-mono text-sm text-muted-foreground">
          {maskedToken}
        </div>
      </div>
    </div>
  );
}
