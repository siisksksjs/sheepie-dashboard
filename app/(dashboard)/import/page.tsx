"use client"

import { useState } from "react"
import { importProducts, importInitialStock, importOrders, getImportTemplates, getNotionMappingGuide, clearLedgerAndOrders } from "@/lib/actions/import"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Upload, Download, AlertCircle, CheckCircle, FileText, Trash2 } from "lucide-react"
import Link from "next/link"

type ImportStep = 'products' | 'stock' | 'orders'

export default function ImportPage() {
  const [currentStep, setCurrentStep] = useState<ImportStep>('products')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{
    success: number
    failed: number
    errors: string[]
  } | null>(null)

  const [mappingGuide, setMappingGuide] = useState<any>(null)
  const [clearing, setClearing] = useState(false)
  const [clearResult, setClearResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: ImportStep) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setResult(null)

    const text = await file.text()

    try {
      let importResult

      switch (type) {
        case 'products':
          importResult = await importProducts(text)
          break
        case 'stock':
          importResult = await importInitialStock(text)
          break
        case 'orders':
          importResult = await importOrders(text)
          break
      }

      setResult(importResult)
    } catch (error: any) {
      setResult({
        success: 0,
        failed: 1,
        errors: [error.message],
      })
    }

    setImporting(false)
    e.target.value = '' // Reset file input
  }

  const downloadTemplate = async (type: 'products' | 'stock' | 'orders') => {
    const templates = await getImportTemplates()
    const csv = templates[type]

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}_template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const showMappingGuide = async () => {
    const guide = await getNotionMappingGuide()
    setMappingGuide(guide)
  }

  const handleClearData = async () => {
    if (!confirm('⚠️ WARNING: This will permanently delete ALL ledger entries and orders. Stock will reset to 0. This cannot be undone!\n\nAre you absolutely sure?')) {
      return
    }

    setClearing(true)
    setClearResult(null)

    try {
      const result = await clearLedgerAndOrders()
      setClearResult(result)
    } catch (error: any) {
      setClearResult({
        success: false,
        error: error.message,
      })
    }

    setClearing(false)
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-display font-bold mb-2">Import Data from Notion</h1>
      <p className="text-muted-foreground mb-8">
        Import your historical data in 3 steps: Products → Initial Stock → Orders
      </p>

      {/* Step Indicator */}
      <div className="flex items-center gap-4 mb-8">
        <div className={`flex items-center gap-2 ${currentStep === 'products' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'products' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            1
          </div>
          <span>Products</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex items-center gap-2 ${currentStep === 'stock' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'stock' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            2
          </div>
          <span>Initial Stock</span>
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex items-center gap-2 ${currentStep === 'orders' ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'orders' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
            3
          </div>
          <span>Orders</span>
        </div>
      </div>

      {/* Notion Mapping Guide */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Notion to CSV Mapping Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={showMappingGuide} variant="outline" size="sm">
            Show Mapping Instructions
          </Button>
        </CardContent>
      </Card>

      {mappingGuide && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How to Extract Data from Notion</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Products Mapping */}
            <div>
              <h3 className="font-semibold mb-2">Step 1: Products</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {mappingGuide.products.description}
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm font-mono">
                <p className="font-semibold text-foreground">CSV Header:</p>
                <p>sku,name,variant,cost_per_unit,reorder_point,is_bundle,status</p>
                <p className="font-semibold text-foreground mt-3">Example Rows:</p>
                {mappingGuide.products.example_rows.map((row: string, i: number) => (
                  <p key={i}>{row}</p>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {Object.entries(mappingGuide.products.mapping).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="font-semibold text-foreground">{key}:</span>
                    <span className="text-muted-foreground">{value as string}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Orders Mapping */}
            <div>
              <h3 className="font-semibold mb-2">Step 3: Orders</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {mappingGuide.orders.description}
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2 text-sm font-mono">
                <p className="font-semibold text-foreground">CSV Header:</p>
                <p>order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status</p>
                <p className="font-semibold text-foreground mt-3">Example Rows:</p>
                {mappingGuide.orders.example_rows.map((row: string, i: number) => (
                  <p key={i}>{row}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Products */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Step 1: Import Products</CardTitle>
          <CardDescription>
            Import products with COGS from your "Modal Product" table
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => downloadTemplate('products')}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>

            <Label
              htmlFor="products-upload"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-all duration-300 active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 h-11 px-8 py-2 cursor-pointer"
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing && currentStep === 'products' ? 'Importing...' : 'Upload CSV'}
            </Label>
            <input
              id="products-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'products')}
              disabled={importing}
            />
          </div>

          {result && currentStep === 'products' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-5 w-5" />
                <span>Successfully imported: {result.success} products</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p>Failed: {result.failed} products</p>
                    <ul className="text-sm mt-2 space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.success > 0 && (
                <Button onClick={() => setCurrentStep('stock')} className="mt-4">
                  Continue to Step 2 →
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Initial Stock */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Step 2: Import Initial Stock</CardTitle>
          <CardDescription>
            Set starting inventory levels (creates IN_PURCHASE ledger entries)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => downloadTemplate('stock')}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>

            <Label
              htmlFor="stock-upload"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-all duration-300 active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 h-11 px-8 py-2 cursor-pointer"
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing && currentStep === 'stock' ? 'Importing...' : 'Upload CSV'}
            </Label>
            <input
              id="stock-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'stock')}
              disabled={importing}
            />
          </div>

          {result && currentStep === 'stock' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-5 w-5" />
                <span>Successfully imported: {result.success} stock entries</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p>Failed: {result.failed} entries</p>
                    <ul className="text-sm mt-2 space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.success > 0 && (
                <Button onClick={() => setCurrentStep('orders')} className="mt-4">
                  Continue to Step 3 →
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Orders */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Step 3: Import Historical Orders</CardTitle>
          <CardDescription>
            Import past orders (auto-generates OUT_SALE ledger entries)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg text-sm">
            <p className="text-warning-foreground">
              <strong>Important:</strong> Historical orders will reduce stock. Make sure you set correct initial stock levels in Step 2.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => downloadTemplate('orders')}>
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>

            <Label
              htmlFor="orders-upload"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-all duration-300 active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 h-11 px-8 py-2 cursor-pointer"
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing && currentStep === 'orders' ? 'Importing...' : 'Upload CSV'}
            </Label>
            <input
              id="orders-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'orders')}
              disabled={importing}
            />
          </div>

          {result && currentStep === 'orders' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle className="h-5 w-5" />
                <span>Successfully imported: {result.success} orders</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p>Failed: {result.failed} orders</p>
                    <ul className="text-sm mt-2 space-y-1">
                      {result.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {result.success > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-success font-semibold">Import Complete! 🎉</p>
                  <div className="flex gap-2">
                    <Link href="/dashboard">
                      <Button>Go to Dashboard</Button>
                    </Link>
                    <Link href="/orders">
                      <Button variant="outline">View Orders</Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone - Clear Data */}
      <Card className="mb-6 border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Clear all imported data. Use this to reset and re-import if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive-foreground mb-3">
              <strong>Warning:</strong> This will permanently delete:
            </p>
            <ul className="text-sm text-destructive-foreground space-y-1 ml-4">
              <li>• All ledger entries (stock history)</li>
              <li>• All orders and order line items</li>
              <li>• Stock levels will reset to 0</li>
            </ul>
            <p className="text-sm text-destructive-foreground mt-3">
              <strong>Products will NOT be deleted.</strong> Only transactional data.
            </p>
          </div>

          <Button
            variant="destructive"
            onClick={handleClearData}
            disabled={clearing}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {clearing ? 'Clearing...' : 'Clear All Ledger & Orders Data'}
          </Button>

          {clearResult && (
            <div className="space-y-2">
              {clearResult.success ? (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle className="h-5 w-5" />
                  <span>{clearResult.message}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5 mt-0.5" />
                  <div>
                    <p>Failed to clear data</p>
                    <p className="text-sm mt-1">{clearResult.error}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
