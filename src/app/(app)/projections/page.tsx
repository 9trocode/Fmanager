import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ProjectionsPage() {
  return (
    <>
      <PageHeader
        title="Projections"
        description="If I save $X/month at Y% return for N months, what's my net worth in each scenario?"
      />

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              Inputs
            </CardTitle>
            <CardDescription>Assumptions you control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="monthly">Monthly contribution (USD)</Label>
              <Input id="monthly" type="number" placeholder="3000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Expected annual return (%)</Label>
              <Input id="rate" type="number" placeholder="7" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="months">Horizon (months)</Label>
              <Input id="months" type="number" placeholder="60" />
            </div>
            <Button className="w-full">Project</Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
            <CardDescription>
              Three lines: Floor (zero equity), Expected (current trajectory), Liquid Today
              (paper, not bankable).
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Run a projection to see results.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
