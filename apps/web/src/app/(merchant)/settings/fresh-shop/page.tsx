import { Address } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, CheckItem, CheckList, Eyebrow, Heading, Label, Text } from "@/components/ui";
import { ArrowRightIcon } from "@/components/icons";
import { routes } from "@/lib/routes";
import { shop } from "@/lib/mock/shop";
import { freshShop } from "@/lib/mock/merchant";

export default function FreshShopPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Settings · shop</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            New shop name, same <Accent>reputation</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        main={
          <>
            <Text size="lead">
              Rotate to a new shop pseudonym. Your Standing Pass moves with you privately, so nobody can link
              the two shops.
            </Text>
            <Card>
              <CheckList>
                {freshShop.checks.map((c) => (
                  <CheckItem key={c.text} ok={c.ok} srLabel={c.ok ? "Yes" : "No"}>
                    {c.text}
                  </CheckItem>
                ))}
              </CheckList>
            </Card>
          </>
        }
        side={
          <>
            <Card className="flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label>Now</Label>
                <Address value={shop.pseudonym} copyable={false} />
              </div>
              <ArrowRightIcon size={18} className="text-fg-muted" />
              <div className="flex flex-col items-end gap-1">
                <Label>New</Label>
                <Address value={freshShop.newPseudonym} copyable={false} className="text-fg-accent" />
              </div>
            </Card>
            <div>
              <Button href={routes.onboarding.shop}>Create new shop</Button>
            </div>
          </>
        }
      />
    </>
  );
}
