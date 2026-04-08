import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface OrderConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  market: {
    ticker: string;
    title: string;
    yes_sub_title?: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
  };
  side: 'yes' | 'no';
  onConfirm: (contracts: number) => Promise<void>;
}

export function OrderConfirmationModal({
  open,
  onOpenChange,
  market,
  side,
  onConfirm,
}: OrderConfirmationModalProps) {
  const [contractsInput, setContractsInput] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Parse contracts for calculations (default to 1 if empty/invalid)
  const contracts = Math.max(1, parseInt(contractsInput) || 1);

  const price = side === 'yes' ? market.yes_ask : market.no_ask;
  const isValidPrice = price != null && price > 0;
  const totalCost = (price * contracts).toFixed(0);
  const potentialPayout = (100 * contracts).toFixed(0);
  const potentialProfit = ((100 - price) * contracts).toFixed(0);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(contracts);
      onOpenChange(false);
    } catch (err) {
      // Error handled in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const outcomeLabel = market.yes_sub_title || market.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {side === 'yes' ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            Confirm Order
          </DialogTitle>
          <DialogDescription>
            Review your order details before placing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Market Info */}
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">{market.title}</p>
            <div className="flex items-center gap-2">
              <Badge variant={side === 'yes' ? 'default' : 'secondary'} className={side === 'yes' ? 'bg-green-600' : 'bg-purple-600'}>
                {side.toUpperCase()}
              </Badge>
              <span className="text-sm text-muted-foreground">{outcomeLabel}</span>
            </div>
          </div>

          {/* Contracts Input */}
          <div className="space-y-2">
            <Label htmlFor="contracts">Number of Contracts</Label>
            <Input
              id="contracts"
              type="number"
              min={1}
              max={10000}
              value={contractsInput}
              onChange={(e) => setContractsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Each contract costs {price}¢ and pays $1.00 if correct
            </p>
          </div>

          {/* Cost Summary */}
          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Price per contract</span>
              <span>{price}¢</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Contracts</span>
              <span>×{contracts}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-medium">
              <span>Total Cost</span>
              <span className="text-primary">${(parseInt(totalCost) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
              <span>Potential Profit</span>
              <span>+${(parseInt(potentialProfit) / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Risk Warning */}
          <div className="flex gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Prediction markets carry risk. Only bet what you can afford to lose.
              This order will be placed immediately on Kalshi.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isSubmitting || !isValidPrice}
            className={side === 'yes' ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Placing Order...
              </>
            ) : (
              <>
                Place ${(parseInt(totalCost) / 100).toFixed(2)} Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
