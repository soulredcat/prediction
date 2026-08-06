package cycle

import (
	"fmt"
	"math"
	"time"

	"github.com/soulredcat/prediction/internal/storage"
)

type Projection struct {
	CycleNumber int       `json:"cycle_number"`
	ATH         time.Time `json:"ath"`
	Low         time.Time `json:"low"`
	WindowStart time.Time `json:"window_start"`
	WindowEnd   time.Time `json:"window_end"`
}

type Response struct {
	Model     storage.Model `json:"model"`
	CycleDays float64       `json:"cycle_days"`
	Items     []Projection  `json:"items"`
}

type Repository interface {
	LoadModel() (storage.Model, error)
	SaveModel(storage.Model) error
}

type Service struct{ repo Repository }

func NewService(repo Repository) *Service { return &Service{repo: repo} }
func (s *Service) GetModel() (storage.Model, error) { return s.repo.LoadModel() }

func (s *Service) UpdateModel(model storage.Model) (storage.Model, error) {
	model.AnchorATH = model.AnchorATH.UTC()
	if err := s.repo.SaveModel(model); err != nil {
		return storage.Model{}, err
	}
	return model, nil
}

func (s *Service) Generate(untilYear int) (Response, error) {
	model, err := s.repo.LoadModel()
	if err != nil {
		return Response{}, err
	}
	if untilYear != 0 {
		model.UntilYear = untilYear
	}
	if model.UntilYear < model.AnchorATH.Year() || model.UntilYear > 9999 {
		return Response{}, fmt.Errorf("until_year outside valid range")
	}

	cycleDays := model.BearDays + model.BullDays
	cycleDuration := days(model.BearDays + model.BullDays)
	bearDuration := days(model.BearDays)
	tolerance := days(float64(model.ToleranceDays))
	end := time.Date(model.UntilYear, time.December, 31, 23, 59, 59, 0, time.UTC)

	items := make([]Projection, 0, 64)
	for index := 0; index <= 10000; index++ {
		ath := model.AnchorATH.Add(time.Duration(index) * cycleDuration)
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
	return Response{Model: model, CycleDays: cycleDays, Items: items}, nil
}

func days(value float64) time.Duration {
	return time.Duration(math.Round(value*24)) * time.Hour
}
