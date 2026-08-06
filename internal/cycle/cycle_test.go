package cycle

import (
	"testing"
	"time"

	"github.com/soulredcat/prediction/internal/storage"
)

type memoryRepo struct{ model storage.Model }

func (m *memoryRepo) LoadModel() (storage.Model, error) { return m.model, nil }
func (m *memoryRepo) SaveModel(value storage.Model) error {
	m.model = value
	return nil
}

func TestKnownProjectionDates(t *testing.T) {
	service := NewService(&memoryRepo{model: storage.DefaultModel()})
	response, err := service.Generate(2026)
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Items) != 3 {
		t.Fatalf("got %d items", len(response.Items))
	}

	want := []struct{ ath, low string }{
		{"2017-12-16T00:00:00Z", "2018-12-21T00:00:00Z"},
		{"2021-11-10T12:00:00Z", "2022-11-15T12:00:00Z"},
		{"2025-10-06T00:00:00Z", "2026-10-11T00:00:00Z"},
	}
	for index, expected := range want {
		ath, _ := time.Parse(time.RFC3339, expected.ath)
		low, _ := time.Parse(time.RFC3339, expected.low)
		if !response.Items[index].ATH.Equal(ath) {
			t.Errorf("ATH %d = %s", index, response.Items[index].ATH)
		}
		if !response.Items[index].Low.Equal(low) {
			t.Errorf("low %d = %s", index, response.Items[index].Low)
		}
	}
}

func TestProjectionThrough2200(t *testing.T) {
	service := NewService(&memoryRepo{model: storage.DefaultModel()})
	response, err := service.Generate(2200)
	if err != nil {
		t.Fatal(err)
	}
	last := response.Items[len(response.Items)-1]
	if last.CycleNumber != 46 {
		t.Fatalf("cycle = %d", last.CycleNumber)
	}
	want := time.Date(2197, time.June, 28, 0, 0, 0, 0, time.UTC)
	if !last.ATH.Equal(want) {
		t.Fatalf("ATH = %s", last.ATH)
	}
}
