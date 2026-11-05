import { KeyValueList } from "@/components/data";
import { PageHeader } from "@/components/layout";
import { Button, Card, Eyebrow, Heading, Label, SegmentedControl, Text } from "@/components/ui";
import { NOT_WIRED, routes } from "@/lib/routes";
import { shop } from "@/lib/mock/shop";
import { languages } from "@/lib/mock/merchant";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Settings</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Settings
          </Heading>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
        <Card>
          <Label id="language-label">Language</Label>
          <SegmentedControl
            aria-labelledby="language-label"
            track="subtle"
            defaultValue="en"
            options={languages.map((l) => ({ value: l.value, label: l.label }))}
          />
          <KeyValueList divider="none" items={[{ k: "Local currency", v: shop.localCurrency, href: NOT_WIRED }]} />
        </Card>

        <Card gap="sm">
          <h2 className="text-body font-semibold text-fg">Credential backup</h2>
          <Text size="small">
            Your Business Pass and Standing Pass live only on this device. Export an encrypted backup.
          </Text>
          <div>
            <Button href={NOT_WIRED} variant="outline">
              Export backup
            </Button>
          </div>
        </Card>

        <Card>
          <Label>Shop</Label>
          <KeyValueList
            items={[
              { k: "Start fresh shop", v: "", href: routes.settings.freshShop },
              { k: "Recover on a new phone", v: "", href: routes.settings.recover },
            ]}
            className="[&>div:first-child]:border-t-0"
          />
        </Card>
      </div>
    </>
  );
}
