# Water Leak Protection — Sales and Deployment Standard

**Status:** Product Owner approved · 2026-07-27  
**Canonical equipment:** TIS-BEE-WTR-LEK-1 — battery-powered Zigbee water leak sensor with built-in buzzer.

## Sales message

Kitchen and Bathroom Collections protect the most common water-risk locations inside those rooms. Away Collection is the whole-home water leak protection layer: it includes one sensor for an external risk point that is harder to notice while the customer is away.

Do not describe Kitchen or Bathroom as whole-home water protection. Do not offer an external water-risk sensor unless Away Collection is selected.

### Standard scope

| Product | Included sensor | Default / selected location | Customer outcome |
| --- | --- | --- | --- |
| Kitchen Collection (C-03) | 1 | Below kitchen sink cabinet | Early Water Leak Detection |
| Bathroom Collection (C-05) | 1 | Vanity cabinet or splash-safe low point | Early Water Leak Detection |
| Away Collection (C-06) | 1 | One selected external risk point | Whole-home Water Leak Protection |

Every sensor is active 24 hours a day. Detection is independent of Normal, Sleep and Away modes. A detection triggers the sensor's local buzzer, a Better Home/TIS screen alert, an app push notification and the configured location name.

### Away location choices

Laundry; hot water unit; refrigerator water connection; water purifier; dishwasher risk point; plant room/equipment area; another permanent water-fed appliance.

The standard Away price includes one selected external location. Further external locations are only available with Away Collection and require an approved Additional Water Leak Sensor Add-on price and site scope.

## Sales FAQ

**Why do I need Away if Kitchen and Bathroom already have sensors?**  
Those Collections protect their rooms' most common leak locations. Away extends monitoring to the places that are often unnoticed during an absence.

**Does it only work when Away mode is on?**  
No. Every water leak sensor is active 24/7. Away adds high-priority remote notification, repeated reminders and a clearer whole-home summary.

**Can I buy one for the laundry without Away?**  
No. External water-risk protection belongs to Away Collection. This keeps the whole-home protection logic clear and correctly scoped.

**Will it turn the water back on after an alarm?**  
No. Any future shutoff option must stay closed until the property is inspected and manually reset.

## Installer checklist

1. Confirm the Collection entitlement and the customer-facing location name.
2. Kitchen: mount below the sink cabinet, away from normal cleaning splash.
3. Bathroom: mount in vanity cabinet or a low point outside normal shower splash.
4. Away: record the one selected external location; confirm it is not already covered by Kitchen or Bathroom scope.
5. Record sensor device ID, Gateway reference, room, installation location and customer display name in `pos2_water_leak_points`.
6. Confirm Zigbee reachability, online status and battery status.
7. Perform a controlled wet-contact test: local buzzer, screen location, App push, alarm timestamp and acknowledgement.
8. Confirm the sensor remains active in Normal, Sleep and Away modes.
9. If a future shutoff is discussed, record it as a site-assessed option only. Confirm valve type, physical clearance, power, signal, manual operation and position feedback. Gas work must be completed by qualified personnel under local rules.
10. Never configure automatic reopen after a shutoff.

## Runtime data fields

`pos2_water_leak_points` records Collection, room, installation location, customer display name, sensor device ID, Gateway reference, online/battery state, last test, alarm state/time, Away extension flag and automatic-shutoff flag. `pos2_water_shutoff_upgrades` holds future site-assessed shutoff options separately from standard Collection scope.
