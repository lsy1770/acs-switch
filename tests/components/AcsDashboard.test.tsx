import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AcsDashboard } from "@/components/acs/AcsDashboard";

const apiMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getCurrent: vi.fn(),
  switchProvider: vi.fn(),
  openExternal: vi.fn(),
  parseDeeplink: vi.fn(),
  importFromDeeplink: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  providersApi: {
    getAll: apiMocks.getAll,
    getCurrent: apiMocks.getCurrent,
    switch: apiMocks.switchProvider,
  },
  settingsApi: {
    openExternal: apiMocks.openExternal,
  },
}));

vi.mock("@/lib/api/deeplink", () => ({
  deeplinkApi: {
    parseDeeplink: apiMocks.parseDeeplink,
    importFromDeeplink: apiMocks.importFromDeeplink,
  },
}));

vi.mock("@/components/ProviderIcon", () => ({
  ProviderIcon: ({ name }: { name: string }) => <span>{name}-icon</span>,
}));

const renderDashboard = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AcsDashboard onOpenAdvanced={vi.fn()} />
    </QueryClientProvider>,
  );
};

describe("AcsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getAll.mockImplementation(async (app: string) => {
      if (app !== "claude") return {};
      return {
        "acs-primary": {
          id: "acs-primary",
          name: "ACS Gateway - 主线路",
          websiteUrl: "https://acsgw.top",
          notes:
            "Managed by ACS Gateway profile\nGroups: claude: 高速组\nAllowed models: claude-sonnet",
          settingsConfig: {
            env: { ANTHROPIC_MODEL: "claude-sonnet" },
          },
        },
        "acs-backup": {
          id: "acs-backup",
          name: "ACS Gateway - 备用线路",
          websiteUrl: "https://acsgw.top",
          notes:
            "Managed by ACS Gateway profile\nGroups: claude: 稳定组\nAllowed models: claude-opus",
          settingsConfig: {
            env: { ANTHROPIC_MODEL: "claude-opus" },
          },
        },
      };
    });
    apiMocks.getCurrent.mockImplementation(async (app: string) =>
      app === "claude" ? "acs-primary" : "",
    );
    apiMocks.switchProvider.mockResolvedValue({ warnings: [] });
  });

  it("shows ACS group and model metadata and switches profiles", async () => {
    renderDashboard();

    expect(await screen.findByText("主线路")).toBeInTheDocument();
    expect(screen.getByText("claude: 高速组")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet")).toBeInTheDocument();
    expect(screen.getByText("备用线路")).toBeInTheDocument();

    fireEvent.click(screen.getByText("备用线路"));
    await waitFor(() =>
      expect(apiMocks.switchProvider).toHaveBeenCalledWith(
        "acs-backup",
        "claude",
      ),
    );
  });

  it("imports a raw one-time provisioning token", async () => {
    apiMocks.parseDeeplink.mockResolvedValue({
      version: "v1",
      resource: "acs-profile",
      provisionToken: "token-value",
    });
    apiMocks.importFromDeeplink.mockResolvedValue({
      type: "acs-profile",
      profileName: "主线路",
      importedIds: ["acs-primary"],
      apps: ["claude"],
    });
    renderDashboard();

    const input = await screen.findByPlaceholderText(
      "acsswitch://... 或一次性配置码",
    );
    fireEvent.change(input, { target: { value: "token-value" } });
    fireEvent.click(screen.getByText("导入并自动配置"));

    await waitFor(() =>
      expect(apiMocks.parseDeeplink).toHaveBeenCalledWith(
        "acsswitch://v1/import?resource=acs-profile&token=token-value",
      ),
    );
    expect(apiMocks.importFromDeeplink).toHaveBeenCalled();
  });
});
