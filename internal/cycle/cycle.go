package cycle

import (
	"math"
	"time"
)

const (
	BearDays      = 370.0
	BullDays      = 1055.5
	CycleDays     = BearDays + BullDays
	UntilYear     = 2200
	ToleranceDays = 30
)

var AnchorATH = time.Date(2017, time.December, 16, 0, 0, 0, 0, time.UTC)

type Model struct {
	AnchorATH     time.Time `json:"anchor_ath"`
	BearDays      float64   `json:"bear_days"`
	BullDays      float64   `json:"bull_days"`
	UntilYear     int       `json:"until_year"`
	ToleranceDays int       `json:"tolerance_days"`
}

type Projection struct {
	CycleNumber int       `json:"cycle_number"`
	ATH         time.Time `json:"ath"`
	Low         time.Time `json:"low"`
	WindowStart time.Time `json:"window_start"`
	WindowEnd   time.Time `json:"window_end"`
}

type Response struct {
	Model     Model        `json:"model"`
	CycleDays float64      `json:"cycle_days"`
	Items     []Projection `json:"items"`
}

type Service struct{}

func NewService() *Service { return &Service{} }

func (*Service) Generate() Response {
	model := Model{
		AnchorATH:     AnchorATH,
		BearDays:      BearDays,
		BullDays:      BullDays,
		UntilYear:     UntilYear,
		ToleranceDays: ToleranceDays,
	}

	cycleDuration := days(CycleDays)
	bearDuration := days(BearDays)
	tolerance := days(ToleranceDays)
	end := time.Date(UntilYear, time.December, 31, 23, 59, 59, 0, time.UTC)

	items := make([]Projection, 0, 64)
	for index := 0; index <= 10000; index++ {
		ath := AnchorATH.Add(time.Duration(index) * cycleDuration)
		if ath.After(end) {
			break
		}
		items = append(items, Projection{
			CycleNumber: index,
			ATH:         ath,
			Low:         ath.Add(bearDuration),
			WindowStart: ath.Add(-tolerance),
			WindowEnd:   ath.Add(tolerance),
		})
	}

	return Response{Model: model, CycleDays: CycleDays, Items: items}
}

func days(value float64) time.Duration {
	return time.Duration(math.Round(value*24)) * time.Hour
}
