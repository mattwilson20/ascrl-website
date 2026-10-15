// Synthetic test fixtures only. These are never loaded by the application or database migrations.
export function exportFixture(subsession = 1001) {
  return {
    type: "event_result",
    data: {
      subsession_id: subsession,
      session_id: 9001,
      start_time: "2026-10-12T23:30:18Z",
      track: { track_name: "Test Speedway" },
      driver_changes: false,
      session_results: [
        {
          simsession_number: -2,
          simsession_name: "QUALIFY",
          simsession_type: 4,
          results: [],
        },
        {
          simsession_number: 0,
          simsession_name: "RACE",
          simsession_type: 6,
          results: [
            {
              cust_id: 101,
              display_name: "Test Driver A",
              finish_position: 0,
              finish_position_in_class: 0,
              starting_position: 1,
              car_class_id: 0,
              laps_complete: 100,
              laps_lead: 60,
              best_lap_time: 500000,
              incidents: 2,
              livery: { car_number: "01" },
              champ_points: 99999,
            },
            {
              cust_id: 102,
              display_name: "Test Driver B",
              finish_position: 1,
              finish_position_in_class: 1,
              starting_position: 0,
              car_class_id: 0,
              laps_complete: 100,
              laps_lead: 40,
              best_lap_time: 490000,
              incidents: 0,
              livery: { car_number: "2" },
              champ_points: 88888,
            },
          ],
        },
      ],
    },
  };
}
export const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
