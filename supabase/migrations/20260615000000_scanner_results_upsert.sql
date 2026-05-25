CREATE UNIQUE INDEX IF NOT EXISTS scanner_results_date_ticker_type_unique
  ON scanner_results (scan_date, ticker, scan_type);
