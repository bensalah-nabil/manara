package admin

import (
	"log"
	"net/http"
	"sort"
	"strconv"
	"time"

	"manara/backend/internal/domain"
)

// AssistantRoutes: what the setup assistant used and cost, per account and per day
// (docs/setup-assistant.md). Token and question counts only, never a question.
func AssistantRoutes(mux *http.ServeMux, h *Handlers) {
	mux.HandleFunc("GET /api/v1/admin/assistant-usage", h.AssistantUsageView)
}

type usageTotals struct {
	Questions  int64   `json:"questions"`
	Input      int64   `json:"inputTokens"`
	Output     int64   `json:"outputTokens"`
	CacheRead  int64   `json:"cacheReadTokens"`
	CacheWrite int64   `json:"cacheWriteTokens"`
	CostUSD    float64 `json:"costUsd"`
	// PriceKnown is false when some use was by a model with no price in domain.AssistantPrices;
	// its cost is then missing from CostUSD.
	PriceKnown bool `json:"priceKnown"`
}

func (t *usageTotals) add(u domain.AssistantUsage) {
	t.Questions += u.Questions
	t.Input += u.Input
	t.Output += u.Output
	t.CacheRead += u.CacheRead
	t.CacheWrite += u.CacheWrite
	if u.Questions == 0 && u.Input == 0 && u.Output == 0 {
		return
	}
	if cost, ok := u.CostUSD(); ok {
		t.CostUSD += cost
	} else {
		t.PriceKnown = false
	}
}

type accountUsage struct {
	AccountID string    `json:"accountId"`
	Email     string    `json:"email"`
	LastDay   time.Time `json:"lastDay"`
	Models    []string  `json:"models"`
	usageTotals
}

type dayUsage struct {
	Day time.Time `json:"day"`
	usageTotals
}

type assistantUsageView struct {
	Days     int            `json:"days"`
	Model    string         `json:"model"`
	Total    usageTotals    `json:"total"`
	PerDay   []dayUsage     `json:"perDay"`
	Accounts []accountUsage `json:"accounts"`
}

// CurrentAssistantModel is the model the assistant answers with now (setuphelp.Model), shown
// beside the figures; set in main.go to avoid importing setuphelp here.
var CurrentAssistantModel = ""

func (h *Handlers) AssistantUsageView(w http.ResponseWriter, r *http.Request) {
	if h.Assistant == nil {
		writeError(w, http.StatusNotFound, "not_found", "")
		return
	}
	days := 30
	if raw := r.URL.Query().Get("days"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 365 {
			writeError(w, http.StatusBadRequest, "bad_request", "days must be 1 to 365")
			return
		}
		days = n
	}
	if _, ok := h.admin(w, r, "viewed_assistant_usage", strconv.Itoa(days)+" days"); !ok {
		return
	}
	now := h.now()
	byDay, err := h.Assistant.AssistantUsageByDay(r.Context(), now, days)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	byAccount, err := h.Assistant.AssistantUsageByAccount(r.Context(), now, days)
	if err != nil {
		log.Printf("admin: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "")
		return
	}
	writeJSON(w, summarizeAssistantUsage(days, byDay, byAccount))
}

// summarizeAssistantUsage folds the per-model rows into per-day and per-account totals with cost,
// accounts most expensive first.
func summarizeAssistantUsage(days int, byDay []domain.DayAssistantUsage, byAccount []domain.AccountAssistantUsage) assistantUsageView {
	view := assistantUsageView{Days: days, Model: CurrentAssistantModel, Total: usageTotals{PriceKnown: true}, PerDay: []dayUsage{}, Accounts: []accountUsage{}}
	for _, d := range byDay {
		if n := len(view.PerDay); n == 0 || !view.PerDay[n-1].Day.Equal(d.Day) {
			view.PerDay = append(view.PerDay, dayUsage{Day: d.Day, usageTotals: usageTotals{PriceKnown: true}})
		}
		view.PerDay[len(view.PerDay)-1].add(d.AssistantUsage)
		view.Total.add(d.AssistantUsage)
	}
	index := map[string]int{}
	for _, a := range byAccount {
		i, ok := index[a.AccountID]
		if !ok {
			i = len(view.Accounts)
			index[a.AccountID] = i
			view.Accounts = append(view.Accounts, accountUsage{AccountID: a.AccountID, Email: a.Email, Models: []string{}, usageTotals: usageTotals{PriceKnown: true}})
		}
		acc := &view.Accounts[i]
		acc.add(a.AssistantUsage)
		acc.Models = append(acc.Models, a.Model)
		if a.LastDay.After(acc.LastDay) {
			acc.LastDay = a.LastDay
		}
	}
	sort.SliceStable(view.Accounts, func(i, j int) bool { return view.Accounts[i].CostUSD > view.Accounts[j].CostUSD })
	return view
}
