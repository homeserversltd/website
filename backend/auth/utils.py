import json
from flask import current_app
from backend.utils.utils import get_config

def _is_element_visible(tab_id: str, element_id: str) -> bool:
    """Checks if a specific UI element is marked as visible in the configuration.

    Uses backend.utils.utils.get_config() to load the application configuration.

    Args:
        tab_id: The ID of the tab containing the element.
        element_id: The ID of the element to check.

    Returns:
        True if the element is visible, False otherwise. Defaults to False on error
        or if the tab itself is not visible.
    """
    try:
        config = get_config()
        
        if not config:
            current_app.logger.error("Failed to load configuration for visibility check (get_config returned empty).")
            return False

        tab_config = config.get('tabs', {}).get(tab_id)
        if not tab_config:
            current_app.logger.warning(f"Visibility check: Tab ID '{tab_id}' not found in configuration.")
            return False

        tab_visibility_settings = tab_config.get('visibility')
        if not tab_visibility_settings:
            current_app.logger.warning(f"Visibility check: No 'visibility' settings found for tab ID '{tab_id}'.")
            return False

        if not tab_visibility_settings.get('tab', False):
            return False
        
        element_is_visible = tab_visibility_settings.get('elements', {}).get(element_id, False)
        return element_is_visible

    except Exception as e:
        current_app.logger.error(f"Unexpected error during visibility check for {tab_id}/{element_id} (after config load): {str(e)}")
        return False
