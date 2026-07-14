import { getAdminSettings } from "@/lib/admin-settings";
import { apiSuccess, handleApiError } from "@/lib/api/response";

/** Public: used by /maintenance and login to show maintenance state. */
export async function GET() {
  try {
    const settings = await getAdminSettings();
    return apiSuccess({
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      registrationEnabled: settings.registrationEnabled,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
